import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';

const filesystemModules = new Set(['fs', 'fs/promises', 'node:fs', 'node:fs/promises']);
const filesystemMutationNames = new Set(['link', 'mkdir', 'open', 'rename', 'rmdir', 'unlink', 'writeFile']);
const adapterPathNames = new Set(['stylesheetPath', 'reportPath']);
const mediaWidthFeature = /^\(\s*(?:min|max)-width\s*:\s*([0-9]+(?:\.[0-9]+)?)px\s*\)$/iu;

export interface InspectedParameter {
  readonly name: string;
  readonly type: string;
}

export interface InspectedExportedFunction {
  readonly name: string;
  readonly parameters: readonly InspectedParameter[];
}

export interface InspectedRuntimeImport {
  readonly moduleReference: string;
  readonly importedName: string;
  readonly localName: string;
}

export interface TypeScriptInspection {
  readonly moduleReferences: readonly string[];
  readonly identifiers: readonly string[];
  readonly literalTexts: readonly string[];
  readonly numericLiterals: readonly number[];
  readonly breakpointMediaValues: readonly number[];
  readonly objectPropertyTables: readonly (readonly string[])[];
  readonly callExpressionNames: readonly string[];
  readonly constructedExpressionNames: readonly string[];
  readonly parameters: readonly InspectedParameter[];
  readonly declaredPropertyNames: readonly string[];
  readonly runtimeImports: readonly InspectedRuntimeImport[];
  readonly exportedFunctions: readonly InspectedExportedFunction[];
}

export interface TypeScriptProjectInspection {
  readonly filesystemMutationCalls: readonly { readonly sourcePath: string; readonly name: string }[];
  readonly adapterPathInputs: readonly { readonly sourcePath: string; readonly name: string }[];
}

type FilesystemProvenance = '*' | string;

function moduleText(expression: ts.Expression | undefined): string | undefined {
  return expression && ts.isStringLiteralLike(expression) ? expression.text : undefined;
}

function modulePathSegments(reference: string): readonly string[] {
  return reference
    .replaceAll('\\', '/')
    .split('/')
    .filter(segment => segment !== '' && segment !== '.' && segment !== '..')
    .map(segment => segment.replace(/\.[cm]?[jt]sx?$/u, ''))
    .filter(segment => segment !== 'index');
}

/** Matches complete normalized module-path segments, including endpoint and index-barrel references. */
export function moduleReferenceContainsPath(reference: string, candidate: string): boolean {
  const referenceSegments = modulePathSegments(reference);
  const candidateSegments = modulePathSegments(candidate);
  return referenceSegments.some((_, index) =>
    candidateSegments.every((segment, offset) => referenceSegments[index + offset] === segment),
  );
}

function hasExportModifier(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) === true
  );
}

function objectPropertyName(property: ts.ObjectLiteralElementLike): string | undefined {
  if (ts.isSpreadAssignment(property)) return undefined;
  const name = property.name;
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : undefined;
}

function expressionName(expression: ts.Expression): string | undefined {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  if (ts.isElementAccessExpression(expression)) return moduleText(expression.argumentExpression);
  return undefined;
}

function declarationPropertyName(node: ts.PropertyDeclaration | ts.PropertySignature): string | undefined {
  const name = node.name;
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : undefined;
}

interface ParenthesizedToken {
  readonly depth: number;
  readonly end: number;
  readonly start: number;
  readonly text: string;
}

function isErrorSinkValue(node: ts.Node): boolean {
  for (let current: ts.Node | undefined = node.parent; current !== undefined; current = current.parent) {
    if (ts.isThrowStatement(current)) return true;
    if (ts.isCallExpression(current) || ts.isNewExpression(current)) {
      const name = expressionName(current.expression);
      if (name !== undefined && /error$/iu.test(name)) return true;
    }
  }
  return false;
}

function parenthesizedTokens(text: string): readonly ParenthesizedToken[] {
  const tokens: ParenthesizedToken[] = [];
  const starts: number[] = [];
  let quote: "'" | '"' | undefined;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const codeUnit = text[index];
    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (codeUnit === '\\') {
        escaped = true;
      } else if (codeUnit === quote) {
        quote = undefined;
      }
      continue;
    }
    if (codeUnit === "'" || codeUnit === '"') {
      quote = codeUnit;
    } else if (codeUnit === '(') {
      starts.push(index);
    } else if (codeUnit === ')') {
      const start = starts.pop();
      if (start === undefined) continue;
      tokens.push({ start, end: index + 1, depth: starts.length + 1, text: text.slice(start, index + 1) });
    }
  }
  return tokens;
}

function standaloneMediaQuery(text: string): boolean {
  const outerTokens = parenthesizedTokens(text).filter(token => token.depth === 1);
  if (outerTokens.length === 0) return false;
  let scaffold = text;
  for (const token of [...outerTokens].sort((left, right) => right.start - left.start)) {
    scaffold = scaffold.slice(0, token.start) + '()' + scaffold.slice(token.end);
  }
  return (
    scaffold
      .replaceAll('${}', '')
      .replace(/@media\b/giu, '')
      .replace(/\b(?:only|not|all|screen|print|speech|and|or)\b/giu, '')
      .replace(/\(\)|[\s,]/gu, '') === ''
  );
}

function atMediaHeaders(text: string): readonly string[] {
  const headers: string[] = [];
  let quote: "'" | '"' | undefined;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const codeUnit = text[index];
    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (codeUnit === '\\') {
        escaped = true;
      } else if (codeUnit === quote) {
        quote = undefined;
      }
      continue;
    }
    if (codeUnit === "'" || codeUnit === '"') {
      quote = codeUnit;
      continue;
    }
    if (text.startsWith('${}', index)) {
      index += 2;
      continue;
    }
    if (text.slice(index, index + 6).toLowerCase() !== '@media' || /[\w-]/u.test(text[index + 6] ?? '')) continue;

    const headerStart = index + 6;
    let depth = 0;
    for (let cursor = headerStart; cursor < text.length; cursor++) {
      if (text.startsWith('${}', cursor)) {
        cursor += 2;
        continue;
      }
      const headerCodeUnit = text[cursor];
      if (headerCodeUnit === '(') depth++;
      else if (headerCodeUnit === ')') depth = Math.max(0, depth - 1);
      else if (headerCodeUnit === '{' && depth === 0) {
        headers.push(text.slice(headerStart, cursor));
        index = cursor;
        break;
      }
    }
  }
  return headers;
}

function hardcodedMediaWidths(text: string): readonly number[] {
  const regions = standaloneMediaQuery(text) ? [text] : atMediaHeaders(text);
  return regions.flatMap(region =>
    parenthesizedTokens(region).flatMap(token => {
      const match = mediaWidthFeature.exec(token.text);
      return match?.[1] === undefined ? [] : [Number(match[1])];
    }),
  );
}

function templateMediaText(node: ts.TemplateExpression): string {
  return (
    node.head.text +
    node.templateSpans
      .map(span => {
        const expression = unwrapExpression(span.expression);
        const interpolation = ts.isNumericLiteral(expression) ? expression.text : '${}';
        return interpolation + span.literal.text;
      })
      .join('')
  );
}

function runtimeImportReference(node: ts.ImportDeclaration): string | undefined {
  const reference = moduleText(node.moduleSpecifier);
  if (reference === undefined) return undefined;
  const clause = node.importClause;
  if (clause === undefined) return reference;
  if (clause.isTypeOnly || clause.name !== undefined) return clause.isTypeOnly ? undefined : reference;
  if (clause.namedBindings === undefined) return undefined;
  if (!ts.isNamedImports(clause.namedBindings)) return reference;
  return clause.namedBindings.elements.some(element => !element.isTypeOnly) ? reference : undefined;
}

function runtimeExportReference(node: ts.ExportDeclaration): string | undefined {
  const reference = moduleText(node.moduleSpecifier);
  if (reference === undefined || node.isTypeOnly) return undefined;
  if (node.exportClause === undefined || !ts.isNamedExports(node.exportClause)) return reference;
  return node.exportClause.elements.some(element => !element.isTypeOnly) ? reference : undefined;
}

function runtimeImportBindings(node: ts.ImportDeclaration): readonly InspectedRuntimeImport[] {
  const moduleReference = moduleText(node.moduleSpecifier);
  const clause = node.importClause;
  if (moduleReference === undefined || clause === undefined || clause.isTypeOnly) return [];

  const bindings: InspectedRuntimeImport[] = [];
  if (clause.name !== undefined) {
    bindings.push({ moduleReference, importedName: 'default', localName: clause.name.text });
  }
  if (clause.namedBindings === undefined) return bindings;
  if (ts.isNamespaceImport(clause.namedBindings)) {
    bindings.push({ moduleReference, importedName: '*', localName: clause.namedBindings.name.text });
    return bindings;
  }
  for (const element of clause.namedBindings.elements) {
    if (element.isTypeOnly) continue;
    bindings.push({
      moduleReference,
      importedName: element.propertyName?.text ?? element.name.text,
      localName: element.name.text,
    });
  }
  return bindings;
}

/** Returns runtime module edges while excluding TypeScript-only imports and re-exports. */
export function runtimeModuleReferences(source: string, sourcePath: string): readonly string[] {
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const references: string[] = [];

  function visit(node: ts.Node): void {
    let reference: string | undefined;
    if (ts.isImportDeclaration(node)) {
      reference = runtimeImportReference(node);
    } else if (ts.isExportDeclaration(node)) {
      reference = runtimeExportReference(node);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      !node.isTypeOnly &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      reference = moduleText(node.moduleReference.expression);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      reference = moduleText(node.arguments[0]);
    }
    if (reference !== undefined) references.push(reference);
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return references;
}

export function inspectTypeScript(source: string, sourcePath: string): TypeScriptInspection {
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const moduleReferences: string[] = [];
  const identifiers: string[] = [];
  const literalTexts: string[] = [];
  const numericLiterals: number[] = [];
  const breakpointMediaValues: number[] = [];
  const objectPropertyTables: string[][] = [];
  const callExpressionNames: string[] = [];
  const constructedExpressionNames: string[] = [];
  const parameters: InspectedParameter[] = [];
  const declaredPropertyNames: string[] = [];
  const runtimeImports: InspectedRuntimeImport[] = [];
  const exportedFunctions: InspectedExportedFunction[] = [];

  function visit(node: ts.Node): void {
    if (ts.isIdentifier(node)) identifiers.push(node.text);
    if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node) || ts.isRegularExpressionLiteral(node)) {
      literalTexts.push(node.text);
      if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !isErrorSinkValue(node)) {
        breakpointMediaValues.push(...hardcodedMediaWidths(node.text));
      }
    }
    if (ts.isNumericLiteral(node)) {
      const value = Number(node.text);
      numericLiterals.push(value);
    }
    if (ts.isTemplateExpression(node) && !isErrorSinkValue(node)) {
      breakpointMediaValues.push(...hardcodedMediaWidths(templateMediaText(node)));
    }
    if (ts.isObjectLiteralExpression(node)) {
      objectPropertyTables.push(
        node.properties.flatMap(property => {
          const name = objectPropertyName(property);
          return name === undefined ? [] : [name];
        }),
      );
    }
    if (ts.isCallExpression(node)) {
      const name = expressionName(node.expression);
      if (name !== undefined) callExpressionNames.push(name);
    }
    if (ts.isNewExpression(node)) {
      const name = expressionName(node.expression);
      if (name !== undefined) constructedExpressionNames.push(name);
    }
    if (ts.isFunctionLike(node)) {
      parameters.push(
        ...node.parameters.map(parameter => ({
          name: parameter.name.getText(sourceFile),
          type: parameter.type?.getText(sourceFile) ?? '',
        })),
      );
    }
    if (ts.isPropertyDeclaration(node) || ts.isPropertySignature(node)) {
      const name = declarationPropertyName(node);
      if (name !== undefined) declaredPropertyNames.push(name);
    }
    if (ts.isImportDeclaration(node)) runtimeImports.push(...runtimeImportBindings(node));

    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      moduleReferences.push(node.argument.literal.text);
    } else if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const reference = moduleText(node.moduleSpecifier);
      if (reference !== undefined) moduleReferences.push(reference);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      const reference = moduleText(node.moduleReference.expression);
      if (reference !== undefined) moduleReferences.push(reference);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const reference = moduleText(node.arguments[0]);
      if (reference !== undefined) moduleReferences.push(reference);
    }

    if (ts.isFunctionDeclaration(node) && node.name && hasExportModifier(node)) {
      exportedFunctions.push({
        name: node.name.text,
        parameters: node.parameters.map(parameter => ({
          name: parameter.name.getText(sourceFile),
          type: parameter.type?.getText(sourceFile) ?? '',
        })),
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return {
    moduleReferences,
    identifiers,
    literalTexts,
    numericLiterals,
    breakpointMediaValues,
    objectPropertyTables,
    callExpressionNames,
    constructedExpressionNames,
    parameters,
    declaredPropertyNames,
    runtimeImports,
    exportedFunctions,
  };
}

function createProjectProgram(
  sourcePaths: readonly string[],
  sourceOverrides: ReadonlyMap<string, string>,
): { readonly checker: ts.TypeChecker; readonly program: ts.Program; readonly rootPaths: ReadonlySet<string> } {
  const normalizedOverrides = new Map(
    [...sourceOverrides].map(([sourcePath, source]) => [resolve(sourcePath), source] as const),
  );
  const overrideDirectories = new Set<string>();
  for (const sourcePath of normalizedOverrides.keys()) {
    for (let directory = dirname(sourcePath); !overrideDirectories.has(directory); directory = dirname(directory)) {
      overrideDirectories.add(directory);
      if (dirname(directory) === directory) break;
    }
  }
  const rootNames = sourcePaths.map(sourcePath => resolve(sourcePath));
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    target: ts.ScriptTarget.ESNext,
    types: ['node'],
  };
  const host = ts.createCompilerHost(options);
  const baseGetSourceFile = host.getSourceFile.bind(host);
  host.fileExists = fileName => normalizedOverrides.has(resolve(fileName)) || ts.sys.fileExists(fileName);
  host.directoryExists = directoryName =>
    overrideDirectories.has(resolve(directoryName)) || ts.sys.directoryExists(directoryName);
  host.readFile = fileName => normalizedOverrides.get(resolve(fileName)) ?? ts.sys.readFile(fileName);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    const source = normalizedOverrides.get(resolve(fileName));
    return source === undefined
      ? baseGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile)
      : ts.createSourceFile(fileName, source, languageVersion, true, ts.ScriptKind.TS);
  };
  const program = ts.createProgram({ rootNames, options, host });
  return { checker: program.getTypeChecker(), program, rootPaths: new Set(rootNames) };
}

function enclosingModuleReference(node: ts.Node): string | undefined {
  for (let current: ts.Node | undefined = node; current !== undefined; current = current.parent) {
    if (ts.isImportDeclaration(current) || ts.isExportDeclaration(current)) {
      return moduleText(current.moduleSpecifier);
    }
    if (ts.isImportEqualsDeclaration(current) && ts.isExternalModuleReference(current.moduleReference)) {
      return moduleText(current.moduleReference.expression);
    }
  }
  return undefined;
}

function isNodeFilesystemDeclaration(declaration: ts.Declaration): boolean {
  return /(?:^|\/)@types\/node\/fs(?:\/promises)?\.d\.ts$/u.test(
    declaration.getSourceFile().fileName.replaceAll('\\', '/'),
  );
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  let current = expression;
  while (
    ts.isAwaitExpression(current) ||
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function calledModule(expression: ts.CallExpression): string | undefined {
  if (
    expression.expression.kind !== ts.SyntaxKind.ImportKeyword &&
    !(ts.isIdentifier(expression.expression) && expression.expression.text === 'require')
  ) {
    return undefined;
  }
  return moduleText(expression.arguments[0]);
}

function bindingElementPropertyName(declaration: ts.BindingElement): string | undefined {
  const name = declaration.propertyName ?? declaration.name;
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : undefined;
}

function filesystemProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): FilesystemProvenance | undefined {
  const unwrapped = unwrapExpression(expression);
  if (ts.isCallExpression(unwrapped)) {
    const reference = calledModule(unwrapped);
    if (reference !== undefined) return filesystemModules.has(reference) ? '*' : undefined;
  }

  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const propertyName = ts.isPropertyAccessExpression(unwrapped)
      ? unwrapped.name.text
      : moduleText(unwrapped.argumentExpression);
    const receiver = filesystemProvenance(unwrapped.expression, checker, seenSymbols);
    if (receiver === '*' && propertyName !== undefined && filesystemMutationNames.has(propertyName))
      return propertyName;
  }

  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (symbol === undefined || seenSymbols.has(symbol)) return undefined;
  const nextSeen = new Set(seenSymbols).add(symbol);

  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    if (aliased !== symbol) {
      const provenance = filesystemSymbolProvenance(aliased, checker, nextSeen);
      if (provenance !== undefined) return provenance;
    }
  }
  return filesystemSymbolProvenance(symbol, checker, nextSeen);
}

function filesystemSymbolProvenance(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol>,
): FilesystemProvenance | undefined {
  const symbolName = symbol.getName();
  if (
    filesystemMutationNames.has(symbolName) &&
    symbol.declarations?.some(declaration => isNodeFilesystemDeclaration(declaration)) === true
  ) {
    return symbolName;
  }

  for (const declaration of symbol.declarations ?? []) {
    const reference = enclosingModuleReference(declaration);
    if (reference !== undefined && filesystemModules.has(reference)) {
      if (ts.isNamespaceImport(declaration) || ts.isImportClause(declaration)) return '*';
      if (ts.isImportSpecifier(declaration)) {
        const importedName = declaration.propertyName?.text ?? declaration.name.text;
        if (filesystemMutationNames.has(importedName)) return importedName;
      }
    }
    if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
      const provenance = filesystemProvenance(declaration.initializer, checker, seenSymbols);
      if (provenance !== undefined) return provenance;
    }
    if (
      (ts.isPropertyAssignment(declaration) || ts.isPropertyDeclaration(declaration)) &&
      declaration.initializer !== undefined
    ) {
      const provenance = filesystemProvenance(declaration.initializer, checker, seenSymbols);
      if (provenance !== undefined) return provenance;
    }
    if (ts.isShorthandPropertyAssignment(declaration)) {
      const valueSymbol = checker.getShorthandAssignmentValueSymbol(declaration);
      if (valueSymbol !== undefined && !seenSymbols.has(valueSymbol)) {
        const provenance = filesystemSymbolProvenance(valueSymbol, checker, new Set(seenSymbols).add(valueSymbol));
        if (provenance !== undefined) return provenance;
      }
    }
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent;
      const variable =
        ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern) ? pattern.parent : undefined;
      if (variable !== undefined && ts.isVariableDeclaration(variable) && variable.initializer !== undefined) {
        const receiver = filesystemProvenance(variable.initializer, checker, seenSymbols);
        const propertyName = bindingElementPropertyName(declaration);
        if (receiver === '*' && propertyName !== undefined && filesystemMutationNames.has(propertyName)) {
          return propertyName;
        }
        if (propertyName !== undefined) {
          const property = checker.getPropertyOfType(checker.getTypeAtLocation(variable.initializer), propertyName);
          if (property !== undefined && !seenSymbols.has(property)) {
            const provenance = filesystemSymbolProvenance(property, checker, new Set(seenSymbols).add(property));
            if (provenance !== undefined) return provenance;
          }
        }
      }
    }
  }
  return undefined;
}

function bindingPathName(name: ts.BindingName): string | undefined {
  if (ts.isIdentifier(name)) return adapterPathNames.has(name.text) ? name.text : undefined;
  for (const element of name.elements) {
    if (ts.isOmittedExpression(element)) continue;
    const direct = bindingElementPropertyName(element);
    if (direct !== undefined && adapterPathNames.has(direct)) return direct;
    const nested = bindingPathName(element.name);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function adapterPathsInType(type: ts.Type, checker: ts.TypeChecker, seen: Set<ts.Type>): readonly string[] {
  if (seen.has(type)) return [];
  seen.add(type);
  const paths: string[] = [];
  for (const property of checker.getPropertiesOfType(type)) {
    const propertyName = property.getName();
    if (adapterPathNames.has(propertyName)) paths.push(propertyName);
    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    if (declaration !== undefined) {
      paths.push(...adapterPathsInType(checker.getTypeOfSymbolAtLocation(property, declaration), checker, seen));
    }
  }
  for (const part of type.isUnionOrIntersection() ? type.types : []) {
    paths.push(...adapterPathsInType(part, checker, seen));
  }
  return paths;
}

/** Semantically inspects filesystem provenance and adapter input types across local module edges. */
export function inspectTypeScriptProject(
  sourcePaths: readonly string[],
  sourceOverrides: ReadonlyMap<string, string> = new Map(),
): TypeScriptProjectInspection {
  const { checker, program, rootPaths } = createProjectProgram(sourcePaths, sourceOverrides);
  const filesystemMutationCalls: { sourcePath: string; name: string }[] = [];
  const adapterPathInputs: { sourcePath: string; name: string }[] = [];
  const seenAdapterPaths = new Set<string>();

  for (const sourceFile of program.getSourceFiles()) {
    const sourcePath = resolve(sourceFile.fileName);
    if (!rootPaths.has(sourcePath)) continue;
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node)) {
        const provenance = filesystemProvenance(node.expression, checker);
        if (provenance !== undefined && provenance !== '*' && filesystemMutationNames.has(provenance)) {
          filesystemMutationCalls.push({ sourcePath, name: provenance });
        }
      }
      if (ts.isFunctionLike(node)) {
        for (const parameter of node.parameters) {
          const paths = [
            bindingPathName(parameter.name),
            ...adapterPathsInType(checker.getTypeAtLocation(parameter), checker, new Set()),
          ];
          for (const name of paths) {
            if (name === undefined) continue;
            const key = `${sourcePath}\0${name}`;
            if (seenAdapterPaths.has(key)) continue;
            seenAdapterPaths.add(key);
            adapterPathInputs.push({ sourcePath, name });
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }

  return { filesystemMutationCalls, adapterPathInputs };
}

export function productionTypeScriptFiles(directory: string): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return productionTypeScriptFiles(path);
    if (!entry.isFile() || !entry.name.endsWith('.ts')) return [];
    return entry.name.endsWith('.spec.ts') || entry.name.endsWith('.test.ts') || entry.name.endsWith('.d.ts')
      ? []
      : [path];
  });
}
