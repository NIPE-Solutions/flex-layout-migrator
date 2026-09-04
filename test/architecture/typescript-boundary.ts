import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import ts from 'typescript';

const filesystemModules = new Set(['fs', 'fs/promises', 'node:fs', 'node:fs/promises', 'fs-extra']);
const filesystemMutationNames = new Set([
  'appendFile',
  'appendFileSync',
  'copy',
  'copyFile',
  'copyFileSync',
  'copySync',
  'cp',
  'cpSync',
  'createFile',
  'createFileSync',
  'createWriteStream',
  'emptyDir',
  'emptyDirSync',
  'ensureDir',
  'ensureDirSync',
  'ensureFile',
  'ensureFileSync',
  'ensureLink',
  'ensureLinkSync',
  'ensureSymlink',
  'ensureSymlinkSync',
  'link',
  'linkSync',
  'mkdir',
  'mkdirSync',
  'mkdtemp',
  'mkdtempSync',
  'move',
  'moveSync',
  'open',
  'openSync',
  'outputFile',
  'outputFileSync',
  'outputJson',
  'outputJsonSync',
  'remove',
  'removeSync',
  'rename',
  'renameSync',
  'rm',
  'rmdir',
  'rmdirSync',
  'rmSync',
  'symlink',
  'symlinkSync',
  'truncate',
  'truncateSync',
  'unlink',
  'unlinkSync',
  'write',
  'writeFile',
  'writeFileSync',
  'writeSync',
  'writev',
  'writevSync',
  'WriteStream',
]);
const adapterPathNames = new Set(['stylesheetPath', 'reportPath']);
const mediaWidthFeature = /^\(\s*(?:min|max)-width\s*:\s*([0-9]+(?:\.[0-9]+)?)px\s*\)$/iu;

function isFilesystemModuleReference(reference: string): boolean {
  return filesystemModules.has(reference) || reference.startsWith('fs-extra/');
}

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
  readonly executionModeInputs: readonly { readonly sourcePath: string; readonly name: string }[];
  readonly transactionApplyCalls: readonly { readonly sourcePath: string; readonly name: 'apply' }[];
  readonly projectWriteAuthorityCalls: readonly {
    readonly sourcePath: string;
    readonly name: 'apply' | 'migrate' | 'run';
  }[];
}

const semanticFilesystemOperationNames = [
  'access',
  'accessSync',
  'createReadStream',
  'Dir',
  'exists',
  'existsSync',
  'FileReadStream',
  'fstat',
  'fstatSync',
  'glob',
  'globSync',
  'lstat',
  'lstatSync',
  'open',
  'openAsBlob',
  'openSync',
  'opendir',
  'opendirSync',
  'pathExists',
  'pathExistsSync',
  'read',
  'readFile',
  'readFileSync',
  'readJSON',
  'readJson',
  'readJSONSync',
  'readJsonSync',
  'readLines',
  'readableWebStream',
  'ReadStream',
  'readSync',
  'readv',
  'readvSync',
  'readdir',
  'readdirSync',
  'readlink',
  'readlinkSync',
  'realpath',
  'realpathSync',
  'stat',
  'statfs',
  'statfsSync',
  'statSync',
  'Utf8Stream',
  'watch',
  'watchFile',
] as const;

type SemanticFilesystemOperation = (typeof semanticFilesystemOperationNames)[number];
type SemanticFilesystemAcquisition = '*' | SemanticFilesystemOperation;
const semanticFilesystemOperations = new Set<string>(semanticFilesystemOperationNames);
const filesystemNamespaceMemberNames = new Set(['default', 'promises']);

export type SemanticAuthorityName =
  | 'AnalyzeProjectStage.run'
  | 'AngularTemplateParser.parse'
  | 'ChangedTemplateValidation.parse'
  | 'CssReferenceParser.parse'
  | 'CurrentMigrationPipeline.run'
  | 'DestinationTemplateSource.read'
  | 'DiscoveryFileSystem.entries'
  | 'DiscoveryFileSystem.kind'
  | 'DiscoverProjectStage.run'
  | `FileSystem.acquire.${SemanticFilesystemAcquisition}`
  | `FileSystem.${SemanticFilesystemOperation}`
  | 'GitIgnoreHelper.acquire'
  | 'GitIgnoreHelper.createGitIgnoreMatcher'
  | 'IgnoreLibrary.acquire'
  | 'IgnoreLibrary.createMatcher'
  | 'IgnoreMatcherFactory.load'
  | 'MigrationTransaction.apply'
  | 'Migrator.migrate'
  | 'OriginalTemplateParser.parse'
  | 'StagedTemplateValidation.parse'
  | 'TemplateInputAnalyzer.analyze'
  | 'TemplateSourceReader.read';

export interface SemanticAuthorityCall {
  readonly sourcePath: string;
  readonly name: SemanticAuthorityName;
}

export interface RuntimeDependencyFinding {
  readonly sourcePath: string;
  readonly dependencyPath: string;
}

/** A runtime import/export binding resolved to its declared symbol, including aliases and namespaces. */
export interface RuntimeSymbolProvenance {
  readonly sourcePath: string;
  readonly symbolName: string;
  readonly declarationPath: string;
}

type FilesystemProvenance = '*' | string;
const inspectionRootPaths = new WeakMap<ts.Program, ReadonlySet<string>>();

function moduleText(expression: ts.Expression | undefined): string | undefined {
  return expression && ts.isStringLiteralLike(expression) ? expression.text : undefined;
}

function resolvedMemberName(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  checker: ts.TypeChecker,
): string | undefined {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  const directName = moduleText(expression.argumentExpression);
  if (directName !== undefined) return directName;
  if (expression.argumentExpression === undefined) return undefined;
  const argumentType = checker.getTypeAtLocation(unwrapExpression(expression.argumentExpression));
  return argumentType.isStringLiteral() || argumentType.isNumberLiteral() ? String(argumentType.value) : undefined;
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
  if (ts.isComputedPropertyName(name)) {
    const expression = unwrapExpression(name.expression);
    return ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression) ? expression.text : undefined;
  }
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
  return /^(?:(?:\$\{\})|@media\b|\b(?:only|not|all|screen|print|speech|and|or)\b|\(\)|[\s,])*$/iu.test(scaffold);
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
  const programRootNames = [...new Set([...rootNames, ...normalizedOverrides.keys()])];
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
  const program = ts.createProgram({ rootNames: programRootNames, options, host });
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
  if (ts.isComputedPropertyName(name)) {
    const expression = unwrapExpression(name.expression);
    return ts.isStringLiteralLike(expression) || ts.isNumericLiteral(expression) ? expression.text : undefined;
  }
  return ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name) ? name.text : undefined;
}

interface BindingElementSource {
  readonly initializer: ts.Expression;
  readonly propertyPath: readonly string[];
}

function bindingElementSource(declaration: ts.BindingElement): BindingElementSource | undefined {
  const propertyPath: string[] = [];
  let current = declaration;

  while (true) {
    if (!ts.isObjectBindingPattern(current.parent)) return undefined;
    const propertyName = bindingElementPropertyName(current);
    if (propertyName === undefined) return undefined;
    propertyPath.unshift(propertyName);

    const owner = current.parent.parent;
    if (ts.isVariableDeclaration(owner)) {
      return owner.initializer === undefined ? undefined : { initializer: owner.initializer, propertyPath };
    }
    if (!ts.isBindingElement(owner)) return undefined;
    current = owner;
  }
}

function filesystemNamespaceMemberProvenance(
  receiver: FilesystemProvenance | undefined,
  propertyName: string,
  operationNames: ReadonlySet<string>,
): FilesystemProvenance | undefined {
  if (receiver !== '*') return undefined;
  if (operationNames.has(propertyName)) return propertyName;
  return filesystemNamespaceMemberNames.has(propertyName) ? '*' : undefined;
}

function filesystemFallbackProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
  operationNames: ReadonlySet<string> = filesystemMutationNames,
  program?: ts.Program,
): FilesystemProvenance | undefined {
  const unwrapped = unwrapExpression(expression);
  if (ts.isCallExpression(unwrapped)) {
    const reference = calledModule(unwrapped);
    if (reference !== undefined) {
      if (isFilesystemModuleReference(reference)) return '*';
      if (
        program !== undefined &&
        runtimeAcquisitionReaches(
          reference,
          unwrapped.getSourceFile().fileName,
          isFilesystemModuleReference,
          () => false,
          program,
        )
      ) {
        return '*';
      }
      return undefined;
    }
  }

  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const propertyName = resolvedMemberName(unwrapped, checker);
    const receiver = filesystemProvenance(unwrapped.expression, checker, seenSymbols, operationNames, program);
    if (propertyName !== undefined) {
      const provenance = filesystemNamespaceMemberProvenance(receiver, propertyName, operationNames);
      if (provenance !== undefined) return provenance;
    }
    const moduleReference = commonJsModuleReference(unwrapped.expression, checker, seenSymbols);
    if (propertyName !== undefined && moduleReference !== undefined && program !== undefined) {
      const provenance = filesystemModuleExportProvenance(
        moduleReference.reference,
        moduleReference.containingSourcePath,
        propertyName,
        operationNames,
        program,
      );
      if (provenance !== undefined) return provenance;
    }
  }

  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (symbol === undefined || seenSymbols.has(symbol)) return undefined;
  const nextSeen = new Set(seenSymbols).add(symbol);

  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    if (aliased !== symbol) {
      const provenance = filesystemSymbolProvenance(aliased, checker, nextSeen, operationNames, program);
      if (provenance !== undefined) return provenance;
    }
  }
  return filesystemSymbolProvenance(symbol, checker, nextSeen, operationNames, program);
}

function filesystemProvenances(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
  operationNames: ReadonlySet<string> = filesystemMutationNames,
  program?: ts.Program,
): readonly FilesystemProvenance[] {
  if (program !== undefined) {
    const moduleMember = runtimeModuleMemberReference(expression, checker, seenSymbols);
    if (moduleMember !== undefined) {
      const provenances = filesystemModuleMemberProvenances(
        moduleMember.reference,
        moduleMember.containingSourcePath,
        moduleMember.memberPath,
        operationNames,
        program,
      );
      if (provenances.length > 0) return provenances;
    }
  }

  const fallback = filesystemFallbackProvenance(expression, checker, seenSymbols, operationNames, program);
  return fallback === undefined ? [] : [fallback];
}

function filesystemProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
  operationNames: ReadonlySet<string> = filesystemMutationNames,
  program?: ts.Program,
): FilesystemProvenance | undefined {
  return filesystemProvenances(expression, checker, seenSymbols, operationNames, program)[0];
}

function filesystemSymbolProvenance(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol>,
  operationNames: ReadonlySet<string> = filesystemMutationNames,
  program?: ts.Program,
): FilesystemProvenance | undefined {
  const symbolName = symbol.getName();
  if (
    operationNames.has(symbolName) &&
    symbol.declarations?.some(declaration => isNodeFilesystemDeclaration(declaration)) === true
  ) {
    return symbolName;
  }

  for (const declaration of symbol.declarations ?? []) {
    const reference = enclosingModuleReference(declaration);
    const filesystemReference =
      reference !== undefined &&
      (isFilesystemModuleReference(reference) ||
        (program !== undefined &&
          runtimeAcquisitionReaches(
            reference,
            declaration.getSourceFile().fileName,
            isFilesystemModuleReference,
            () => false,
            program,
          )));
    if (filesystemReference) {
      if (ts.isNamespaceImport(declaration) || ts.isImportClause(declaration)) return '*';
      if (ts.isImportEqualsDeclaration(declaration)) return '*';
      if (ts.isImportSpecifier(declaration)) {
        const importedName = declaration.propertyName?.text ?? declaration.name.text;
        if (operationNames.has(importedName)) return importedName;
        if (reference !== undefined && program !== undefined) {
          const provenance = filesystemModuleExportProvenance(
            reference,
            declaration.getSourceFile().fileName,
            importedName,
            operationNames,
            program,
          );
          if (provenance !== undefined) return provenance;
        }
      }
    }
    if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
      const provenance = filesystemProvenance(declaration.initializer, checker, seenSymbols, operationNames, program);
      if (provenance !== undefined) return provenance;
    }
    if (
      (ts.isPropertyAssignment(declaration) || ts.isPropertyDeclaration(declaration)) &&
      declaration.initializer !== undefined
    ) {
      const provenance = filesystemProvenance(declaration.initializer, checker, seenSymbols, operationNames, program);
      if (provenance !== undefined) return provenance;
    }
    if (ts.isShorthandPropertyAssignment(declaration)) {
      const valueSymbol = checker.getShorthandAssignmentValueSymbol(declaration);
      if (valueSymbol !== undefined && !seenSymbols.has(valueSymbol)) {
        const provenance = filesystemSymbolProvenance(
          valueSymbol,
          checker,
          new Set(seenSymbols).add(valueSymbol),
          operationNames,
          program,
        );
        if (provenance !== undefined) return provenance;
      }
    }
    if (ts.isBindingElement(declaration)) {
      const source = bindingElementSource(declaration);
      if (source !== undefined) {
        const [firstProperty, ...remainingProperties] = source.propertyPath;
        if (firstProperty === undefined) continue;
        const moduleReference = commonJsModuleReference(source.initializer, checker, seenSymbols);
        let provenance =
          moduleReference !== undefined && program !== undefined
            ? filesystemModuleExportProvenance(
                moduleReference.reference,
                moduleReference.containingSourcePath,
                firstProperty,
                operationNames,
                program,
              )
            : filesystemNamespaceMemberProvenance(
                filesystemProvenance(source.initializer, checker, seenSymbols, operationNames, program),
                firstProperty,
                operationNames,
              );
        for (const propertyName of remainingProperties) {
          provenance = filesystemNamespaceMemberProvenance(provenance, propertyName, operationNames);
        }
        if (provenance !== undefined) return provenance;

        const property = checker.getPropertyOfType(checker.getTypeAtLocation(source.initializer), firstProperty);
        if (property !== undefined && !seenSymbols.has(property)) {
          provenance = filesystemSymbolProvenance(
            property,
            checker,
            new Set(seenSymbols).add(property),
            operationNames,
            program,
          );
          for (const propertyName of remainingProperties) {
            provenance = filesystemNamespaceMemberProvenance(provenance, propertyName, operationNames);
          }
          if (provenance !== undefined) return provenance;
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

function normalizedDeclarationPath(declaration: ts.Declaration): string {
  return declaration.getSourceFile().fileName.replaceAll('\\', '/');
}

function typeHasDeclaration(type: ts.Type, symbolName: string, sourcePathSuffix: string): boolean {
  return [type.aliasSymbol, type.getSymbol()].some(
    symbol =>
      symbol?.getName() === symbolName &&
      symbol.declarations?.some(declaration => normalizedDeclarationPath(declaration).endsWith(sourcePathSuffix)) ===
        true,
  );
}

function isMigrationModeType(type: ts.Type): boolean {
  return typeHasDeclaration(type, 'MigrationMode', '/migrator/migration-mode.ts');
}

function isMigrationReportType(type: ts.Type): boolean {
  return typeHasDeclaration(type, 'MigrationReport', '/report/migration-report.ts');
}

function canonicalMigrationModeSymbol(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  if (symbol === undefined || seenSymbols.has(symbol)) return false;
  const nextSeen = new Set(seenSymbols).add(symbol);
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    if (aliased !== symbol && canonicalMigrationModeSymbol(aliased, checker, nextSeen)) return true;
  }
  return (symbol.declarations ?? []).some(declaration => {
    if (
      ts.isTypeAliasDeclaration(declaration) &&
      declaration.name.text === 'MigrationMode' &&
      normalizedDeclarationPath(declaration).endsWith('/migrator/migration-mode.ts')
    ) {
      return true;
    }
    return (
      ts.isTypeAliasDeclaration(declaration) && canonicalMigrationModeTypeNode(declaration.type, checker, nextSeen)
    );
  });
}

function canonicalMigrationModeTypeNode(
  typeNode: ts.TypeNode | undefined,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  if (typeNode === undefined) return false;
  if (ts.isParenthesizedTypeNode(typeNode)) {
    return canonicalMigrationModeTypeNode(typeNode.type, checker, seenSymbols);
  }
  if (ts.isNamedTupleMember(typeNode) || ts.isOptionalTypeNode(typeNode) || ts.isRestTypeNode(typeNode)) {
    return canonicalMigrationModeTypeNode(typeNode.type, checker, seenSymbols);
  }
  if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) {
    return typeNode.types.some(type => canonicalMigrationModeTypeNode(type, checker, seenSymbols));
  }
  if (ts.isTupleTypeNode(typeNode)) {
    return typeNode.elements.some(type => canonicalMigrationModeTypeNode(type, checker, seenSymbols));
  }
  if (ts.isArrayTypeNode(typeNode)) {
    return canonicalMigrationModeTypeNode(typeNode.elementType, checker, seenSymbols);
  }
  if (ts.isTypeOperatorNode(typeNode)) {
    return canonicalMigrationModeTypeNode(typeNode.type, checker, seenSymbols);
  }
  if (!ts.isTypeReferenceNode(typeNode)) return false;
  return (
    canonicalMigrationModeSymbol(checker.getSymbolAtLocation(typeNode.typeName), checker, seenSymbols) ||
    typeNode.typeArguments?.some(type => canonicalMigrationModeTypeNode(type, checker, seenSymbols)) === true
  );
}

function declarationHasCanonicalMigrationMode(declaration: ts.Declaration, checker: ts.TypeChecker): boolean {
  return (
    (ts.isParameter(declaration) || ts.isPropertyDeclaration(declaration) || ts.isPropertySignature(declaration)) &&
    canonicalMigrationModeTypeNode(declaration.type, checker)
  );
}

function definedTypeParts(type: ts.Type): readonly ts.Type[] {
  const parts = type.isUnion() ? type.types : [type];
  return parts.filter(part => (part.flags & ts.TypeFlags.Undefined) === 0);
}

function isExactModeUnion(type: ts.Type): boolean {
  const parts = definedTypeParts(type);
  if (parts.length !== 2) return false;
  const values = parts.flatMap(part => (part.isStringLiteral() ? [part.value] : []));
  return values.length === 2 && values.includes('plan') && values.includes('write');
}

function isBooleanType(type: ts.Type): boolean {
  if ((type.flags & ts.TypeFlags.Boolean) !== 0) return true;
  const parts = definedTypeParts(type);
  return parts.length === 2 && parts.every(part => (part.flags & ts.TypeFlags.BooleanLiteral) !== 0);
}

function executionModeInputsInType(type: ts.Type, checker: ts.TypeChecker, seen: Set<ts.Type>): readonly string[] {
  if (seen.has(type) || isMigrationReportType(type)) return [];
  seen.add(type);

  const inputs: string[] = [];
  for (const property of checker.getPropertiesOfType(type)) {
    const declaration = property.valueDeclaration ?? property.declarations?.[0];
    if (declaration === undefined) continue;
    const name = property.getName();
    const propertyType = checker.getTypeOfSymbolAtLocation(property, declaration);
    if (
      declarationHasCanonicalMigrationMode(declaration, checker) ||
      isMigrationModeType(propertyType) ||
      (name === 'mode' && isExactModeUnion(propertyType))
    ) {
      inputs.push(name);
      continue;
    }
    if (name === 'write' && isBooleanType(propertyType)) {
      inputs.push(name);
      continue;
    }
    inputs.push(...executionModeInputsInType(propertyType, checker, seen));
  }
  for (const part of type.isUnionOrIntersection() ? type.types : []) {
    inputs.push(...executionModeInputsInType(part, checker, seen));
  }
  return inputs;
}

function executionModeInputsInParameter(
  parameter: ts.ParameterDeclaration,
  checker: ts.TypeChecker,
): readonly string[] {
  const type = checker.getTypeAtLocation(parameter);
  if (ts.isIdentifier(parameter.name)) {
    const name = parameter.name.text;
    if (declarationHasCanonicalMigrationMode(parameter, checker) || isMigrationModeType(type)) return [name];
    if (name === 'mode' && isExactModeUnion(type)) return [name];
    if (name === 'write' && isBooleanType(type)) return [name];
  }
  return executionModeInputsInType(type, checker, new Set());
}

function transactionApplyDeclaration(declaration: ts.Declaration): boolean {
  if (!normalizedDeclarationPath(declaration).endsWith('/transaction/migration-transaction.ts')) return false;
  for (let current: ts.Node | undefined = declaration; current !== undefined; current = current.parent) {
    if (ts.isClassDeclaration(current)) return current.name?.text === 'MigrationTransaction';
  }
  return false;
}

function transactionApplySymbol(symbol: ts.Symbol | undefined): boolean {
  return (
    symbol?.getName() === 'apply' &&
    symbol.declarations?.some(declaration => transactionApplyDeclaration(declaration)) === true
  );
}

function migrationTransactionClassSymbol(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  if (symbol === undefined || seenSymbols.has(symbol)) return false;
  const nextSeen = new Set(seenSymbols).add(symbol);
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    if (aliased !== symbol && migrationTransactionClassSymbol(aliased, checker, nextSeen)) return true;
  }
  return (
    symbol.getName() === 'MigrationTransaction' &&
    symbol.declarations?.some(
      declaration =>
        ts.isClassDeclaration(declaration) &&
        normalizedDeclarationPath(declaration).endsWith('/transaction/migration-transaction.ts'),
    ) === true
  );
}

function migratorMigrateDeclaration(declaration: ts.Declaration): boolean {
  if (!normalizedDeclarationPath(declaration).endsWith('/migrator/migrator.ts')) return false;
  for (let current: ts.Node | undefined = declaration; current !== undefined; current = current.parent) {
    if (ts.isClassDeclaration(current)) return current.name?.text === 'Migrator';
  }
  return false;
}

function migratorMigrateSymbol(symbol: ts.Symbol | undefined): boolean {
  return (
    symbol?.getName() === 'migrate' &&
    symbol.declarations?.some(declaration => migratorMigrateDeclaration(declaration)) === true
  );
}

function migratorClassSymbol(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  if (symbol === undefined || seenSymbols.has(symbol)) return false;
  const nextSeen = new Set(seenSymbols).add(symbol);
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    if (aliased !== symbol && migratorClassSymbol(aliased, checker, nextSeen)) return true;
  }
  return (
    symbol.getName() === 'Migrator' &&
    symbol.declarations?.some(
      declaration =>
        ts.isClassDeclaration(declaration) && normalizedDeclarationPath(declaration).endsWith('/migrator/migrator.ts'),
    ) === true
  );
}

function currentMigrationPipelineRunDeclaration(declaration: ts.Declaration): boolean {
  if (!normalizedDeclarationPath(declaration).endsWith('/pipeline/current-migration.pipeline.ts')) return false;
  for (let current: ts.Node | undefined = declaration; current !== undefined; current = current.parent) {
    if (ts.isClassDeclaration(current)) return current.name?.text === 'CurrentMigrationPipeline';
    if (ts.isInterfaceDeclaration(current)) return current.name.text === 'MigrationRunner';
  }
  return false;
}

function currentMigrationPipelineRunSymbol(symbol: ts.Symbol | undefined): boolean {
  return (
    symbol?.getName() === 'run' &&
    symbol.declarations?.some(declaration => currentMigrationPipelineRunDeclaration(declaration)) === true
  );
}

function currentMigrationPipelineClassSymbol(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  if (symbol === undefined || seenSymbols.has(symbol)) return false;
  const nextSeen = new Set(seenSymbols).add(symbol);
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    if (aliased !== symbol && currentMigrationPipelineClassSymbol(aliased, checker, nextSeen)) return true;
  }
  return (
    symbol.getName() === 'CurrentMigrationPipeline' &&
    symbol.declarations?.some(
      declaration =>
        ts.isClassDeclaration(declaration) &&
        normalizedDeclarationPath(declaration).endsWith('/pipeline/current-migration.pipeline.ts'),
    ) === true
  );
}

function localModuleCandidates(reference: string, containingSourcePath: string): readonly string[] {
  if (!reference.startsWith('.')) return [];
  const base = resolve(dirname(containingSourcePath), reference);
  const withoutJavaScriptExtension = base.replace(/\.[cm]?js$/u, '');
  return [
    base,
    `${withoutJavaScriptExtension}.ts`,
    `${withoutJavaScriptExtension}.tsx`,
    join(withoutJavaScriptExtension, 'index.ts'),
  ].map(candidate => resolve(candidate));
}

interface CommonJsModuleReference {
  readonly reference: string;
  readonly containingSourcePath: string;
}

function commonJsExportedSymbol(
  moduleReference: CommonJsModuleReference,
  exportedName: string,
  checker: ts.TypeChecker,
  program: ts.Program,
): ts.Symbol | undefined {
  const sourceFile = localModuleCandidates(moduleReference.reference, moduleReference.containingSourcePath)
    .map(candidate => program.getSourceFile(candidate))
    .find((candidate): candidate is ts.SourceFile => candidate !== undefined);
  if (sourceFile === undefined) return undefined;
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  return moduleSymbol === undefined
    ? undefined
    : checker.getExportsOfModule(moduleSymbol).find(symbol => symbol.getName() === exportedName);
}

function commonJsModuleReference(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): CommonJsModuleReference | undefined {
  const unwrapped = unwrapExpression(expression);
  if (ts.isCallExpression(unwrapped)) {
    const reference = calledModule(unwrapped);
    if (reference !== undefined) {
      return { reference, containingSourcePath: unwrapped.getSourceFile().fileName };
    }
  }
  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (symbol === undefined || seenSymbols.has(symbol)) return undefined;
  const nextSeen = new Set(seenSymbols).add(symbol);
  for (const declaration of symbol.declarations ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
      const reference = commonJsModuleReference(declaration.initializer, checker, nextSeen);
      if (reference !== undefined) return reference;
    }
  }
  return undefined;
}

interface RuntimeModuleMemberReference extends CommonJsModuleReference {
  readonly memberPath: readonly string[];
}

function runtimeModuleMemberReference(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): RuntimeModuleMemberReference | undefined {
  const unwrapped = unwrapExpression(expression);
  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const memberName = resolvedMemberName(unwrapped, checker);
    const receiver = runtimeModuleMemberReference(unwrapped.expression, checker, seenSymbols);
    return memberName === undefined || receiver === undefined
      ? undefined
      : { ...receiver, memberPath: [...receiver.memberPath, memberName] };
  }
  if (ts.isCallExpression(unwrapped)) {
    const reference = calledModule(unwrapped);
    return reference === undefined
      ? undefined
      : { reference, containingSourcePath: unwrapped.getSourceFile().fileName, memberPath: [] };
  }

  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (symbol === undefined || seenSymbols.has(symbol)) return undefined;
  const nextSeen = new Set(seenSymbols).add(symbol);
  for (const declaration of symbol.declarations ?? []) {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
      const reference = runtimeModuleMemberReference(declaration.initializer, checker, nextSeen);
      if (reference !== undefined) return reference;
      continue;
    }
    if (ts.isBindingElement(declaration)) {
      const source = bindingElementSource(declaration);
      if (source === undefined) continue;
      const reference = runtimeModuleMemberReference(source.initializer, checker, nextSeen);
      if (reference !== undefined) {
        return { ...reference, memberPath: [...reference.memberPath, ...source.propertyPath] };
      }
      continue;
    }
    if (ts.isImportSpecifier(declaration)) {
      const clause = declaration.parent.parent;
      if (declaration.isTypeOnly || clause.isTypeOnly) continue;
      const reference = enclosingModuleReference(declaration);
      if (reference !== undefined) {
        return {
          reference,
          containingSourcePath: declaration.getSourceFile().fileName,
          memberPath: [declaration.propertyName?.text ?? declaration.name.text],
        };
      }
      continue;
    }
    if (ts.isNamespaceImport(declaration)) {
      if (declaration.parent.isTypeOnly) continue;
      const reference = enclosingModuleReference(declaration);
      if (reference !== undefined) {
        return { reference, containingSourcePath: declaration.getSourceFile().fileName, memberPath: [] };
      }
      continue;
    }
    if (ts.isImportClause(declaration)) {
      if (declaration.isTypeOnly) continue;
      const reference = enclosingModuleReference(declaration);
      if (reference !== undefined) {
        return {
          reference,
          containingSourcePath: declaration.getSourceFile().fileName,
          memberPath: ['default'],
        };
      }
      continue;
    }
    if (
      ts.isImportEqualsDeclaration(declaration) &&
      !declaration.isTypeOnly &&
      ts.isExternalModuleReference(declaration.moduleReference)
    ) {
      const reference = moduleText(declaration.moduleReference.expression);
      if (reference !== undefined) {
        return { reference, containingSourcePath: declaration.getSourceFile().fileName, memberPath: [] };
      }
    }
  }
  return undefined;
}

function moduleExportsMigrationTransaction(
  moduleReference: CommonJsModuleReference,
  exportedName: string,
  checker: ts.TypeChecker,
  program: ts.Program,
): boolean {
  const candidates = localModuleCandidates(moduleReference.reference, moduleReference.containingSourcePath);
  if (
    exportedName === 'MigrationTransaction' &&
    candidates.some(candidate => candidate.replaceAll('\\', '/').endsWith('/transaction/migration-transaction.ts'))
  ) {
    return true;
  }

  return migrationTransactionClassSymbol(
    commonJsExportedSymbol(moduleReference, exportedName, checker, program),
    checker,
  );
}

function moduleExportsMigrator(
  moduleReference: CommonJsModuleReference,
  exportedName: string,
  checker: ts.TypeChecker,
  program: ts.Program,
): boolean {
  const candidates = localModuleCandidates(moduleReference.reference, moduleReference.containingSourcePath);
  if (
    exportedName === 'Migrator' &&
    candidates.some(candidate => candidate.replaceAll('\\', '/').endsWith('/migrator/migrator.ts'))
  ) {
    return true;
  }

  return migratorClassSymbol(commonJsExportedSymbol(moduleReference, exportedName, checker, program), checker);
}

function moduleExportsCurrentMigrationPipeline(
  moduleReference: CommonJsModuleReference,
  exportedName: string,
  checker: ts.TypeChecker,
  program: ts.Program,
): boolean {
  const candidates = localModuleCandidates(moduleReference.reference, moduleReference.containingSourcePath);
  if (
    exportedName === 'CurrentMigrationPipeline' &&
    candidates.some(candidate => candidate.replaceAll('\\', '/').endsWith('/pipeline/current-migration.pipeline.ts'))
  ) {
    return true;
  }

  return currentMigrationPipelineClassSymbol(
    commonJsExportedSymbol(moduleReference, exportedName, checker, program),
    checker,
  );
}

function reflectApplyDeclaration(declaration: ts.Declaration): boolean {
  if (!normalizedDeclarationPath(declaration).endsWith('/lib.es2015.reflect.d.ts')) return false;
  for (let current: ts.Node | undefined = declaration; current !== undefined; current = current.parent) {
    if (ts.isModuleDeclaration(current) && (ts.isIdentifier(current.name) || ts.isStringLiteralLike(current.name))) {
      return current.name.text === 'Reflect';
    }
  }
  return false;
}

function canonicalReflectApplySymbol(symbol: ts.Symbol | undefined): boolean {
  return (
    symbol?.getName() === 'apply' &&
    symbol.declarations?.some(declaration => reflectApplyDeclaration(declaration)) === true
  );
}

interface ReflectApplyCallableProvenance {
  readonly boundArguments: readonly ts.Expression[];
}

function reflectApplySymbolProvenance(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol>,
): ReflectApplyCallableProvenance | undefined {
  if (symbol === undefined || seenSymbols.has(symbol)) return undefined;
  const nextSeen = new Set(seenSymbols).add(symbol);
  if (canonicalReflectApplySymbol(symbol)) return { boundArguments: [] };
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    const provenance = reflectApplySymbolProvenance(aliased, checker, program, nextSeen);
    if (provenance !== undefined) return provenance;
  }
  for (const declaration of symbol.declarations ?? []) {
    if (
      (ts.isVariableDeclaration(declaration) ||
        ts.isPropertyAssignment(declaration) ||
        ts.isPropertyDeclaration(declaration)) &&
      declaration.initializer !== undefined
    ) {
      const provenance = reflectApplyCallableProvenance(declaration.initializer, checker, program, nextSeen);
      if (provenance !== undefined) return provenance;
    }
    if (ts.isShorthandPropertyAssignment(declaration)) {
      const provenance = reflectApplySymbolProvenance(
        checker.getShorthandAssignmentValueSymbol(declaration),
        checker,
        program,
        nextSeen,
      );
      if (provenance !== undefined) return provenance;
    }
    if (ts.isExportAssignment(declaration)) {
      const provenance = reflectApplyCallableProvenance(declaration.expression, checker, program, nextSeen);
      if (provenance !== undefined) return provenance;
    }
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent;
      const variable =
        ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern) ? pattern.parent : undefined;
      if (variable === undefined || !ts.isVariableDeclaration(variable) || variable.initializer === undefined) {
        continue;
      }
      const propertyName = bindingElementPropertyName(declaration);
      if (propertyName === undefined) continue;
      const property = checker.getPropertyOfType(checker.getTypeAtLocation(variable.initializer), propertyName);
      const provenance = reflectApplySymbolProvenance(property, checker, program, nextSeen);
      if (provenance !== undefined) return provenance;
    }
  }
  return undefined;
}

function reflectApplyCallableProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): ReflectApplyCallableProvenance | undefined {
  const unwrapped = unwrapExpression(expression);
  if (ts.isCallExpression(unwrapped)) {
    const target = unwrapExpression(unwrapped.expression);
    if (
      (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) &&
      resolvedMemberName(target, checker) === 'bind'
    ) {
      const provenance = reflectApplyCallableProvenance(target.expression, checker, program, seenSymbols);
      return provenance === undefined
        ? undefined
        : { boundArguments: [...provenance.boundArguments, ...unwrapped.arguments.slice(1)] };
    }
    return undefined;
  }

  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const name = resolvedMemberName(unwrapped, checker);
    if (name === 'apply' || (name === undefined && ts.isElementAccessExpression(unwrapped))) {
      const property = checker.getPropertyOfType(checker.getTypeAtLocation(unwrapped.expression), 'apply');
      const provenance = reflectApplySymbolProvenance(property, checker, program, seenSymbols);
      if (provenance !== undefined) return provenance;
    }
    const propertyNode = ts.isPropertyAccessExpression(unwrapped) ? unwrapped.name : unwrapped.argumentExpression;
    if (propertyNode !== undefined) {
      const provenance = reflectApplySymbolProvenance(
        checker.getSymbolAtLocation(propertyNode),
        checker,
        program,
        seenSymbols,
      );
      if (provenance !== undefined) return provenance;
    }
  }

  return reflectApplySymbolProvenance(checker.getSymbolAtLocation(unwrapped), checker, program, seenSymbols);
}

interface ReflectedApplyInvocation {
  readonly target: ts.Expression;
  readonly arguments?: readonly ts.Expression[];
}

function arrayLiteralArguments(expression: ts.Expression | undefined): readonly ts.Expression[] | undefined {
  if (expression === undefined) return undefined;
  const unwrapped = unwrapExpression(expression);
  if (!ts.isArrayLiteralExpression(unwrapped)) return undefined;
  return unwrapped.elements.flatMap(element => (ts.isOmittedExpression(element) ? [] : [element]));
}

interface ResolvedCallableInvocation<Provenance> {
  readonly provenance: Provenance;
  readonly arguments?: readonly ts.Expression[];
}

function resolvedCallableInvocation<Provenance>(
  expression: ts.CallExpression,
  checker: ts.TypeChecker,
  resolveCallable: (target: ts.Expression) => Provenance | undefined,
): ResolvedCallableInvocation<Provenance> | undefined {
  return resolvedCallableApplication(expression.expression, expression.arguments, checker, resolveCallable);
}

function resolvedCallableApplication<Provenance>(
  expression: ts.Expression,
  suppliedArguments: readonly ts.Expression[] | undefined,
  checker: ts.TypeChecker,
  resolveCallable: (target: ts.Expression) => Provenance | undefined,
): ResolvedCallableInvocation<Provenance> | undefined {
  const direct = resolveCallable(expression);
  if (direct !== undefined) {
    return suppliedArguments === undefined
      ? { provenance: direct }
      : { provenance: direct, arguments: suppliedArguments };
  }

  const target = unwrapExpression(expression);
  if (!ts.isPropertyAccessExpression(target) && !ts.isElementAccessExpression(target)) return undefined;
  const name = resolvedMemberName(target, checker);
  if (name === 'apply') {
    const provenance = resolveCallable(target.expression);
    if (provenance === undefined) return undefined;
    const callArguments = arrayLiteralArguments(suppliedArguments?.[1]);
    return callArguments === undefined ? { provenance } : { provenance, arguments: callArguments };
  }
  if (name !== 'call') return undefined;

  const provenance = resolveCallable(target.expression);
  if (provenance !== undefined) {
    return suppliedArguments === undefined ? { provenance } : { provenance, arguments: suppliedArguments.slice(1) };
  }

  const nestedTarget = unwrapExpression(target.expression);
  if (
    (!ts.isPropertyAccessExpression(nestedTarget) && !ts.isElementAccessExpression(nestedTarget)) ||
    resolvedMemberName(nestedTarget, checker) !== 'call' ||
    resolveCallable(nestedTarget.expression) === undefined
  ) {
    return undefined;
  }
  if (suppliedArguments === undefined) return undefined;
  const reboundTarget = suppliedArguments[0];
  if (reboundTarget === undefined) return undefined;
  const reboundProvenance = resolveCallable(reboundTarget);
  return reboundProvenance === undefined
    ? undefined
    : { provenance: reboundProvenance, arguments: suppliedArguments.slice(2) };
}

function reflectedApplyInvocation(
  expression: ts.CallExpression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol>,
): ReflectedApplyInvocation | undefined {
  const invocation = resolvedCallableInvocation(expression, checker, target =>
    reflectApplyCallableProvenance(target, checker, program, seenSymbols),
  );
  if (invocation === undefined) return undefined;
  const effectiveArguments =
    invocation.arguments === undefined
      ? invocation.provenance.boundArguments
      : [...invocation.provenance.boundArguments, ...invocation.arguments];
  const target = effectiveArguments[0];
  if (target === undefined) return undefined;
  const reflectedArguments = arrayLiteralArguments(effectiveArguments[2]);
  return reflectedArguments === undefined ? { target } : { target, arguments: reflectedArguments };
}

function migrationTransactionConstructorProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(expression);
  const directSymbol = checker.getSymbolAtLocation(unwrapped);
  if (migrationTransactionClassSymbol(directSymbol, checker)) return true;

  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const exportedName = ts.isPropertyAccessExpression(unwrapped)
      ? unwrapped.name.text
      : moduleText(unwrapped.argumentExpression);
    const moduleReference = commonJsModuleReference(unwrapped.expression, checker, seenSymbols);
    if (
      exportedName !== undefined &&
      moduleReference !== undefined &&
      moduleExportsMigrationTransaction(moduleReference, exportedName, checker, program)
    ) {
      return true;
    }
  }

  if (directSymbol === undefined || seenSymbols.has(directSymbol)) return false;
  const nextSeen = new Set(seenSymbols).add(directSymbol);
  if ((directSymbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(directSymbol);
    if (migrationTransactionClassSymbol(aliased, checker)) return true;
  }
  return (directSymbol.declarations ?? []).some(declaration => {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
      return migrationTransactionConstructorProvenance(declaration.initializer, checker, program, nextSeen);
    }
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent;
      const variable =
        ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern) ? pattern.parent : undefined;
      if (variable === undefined || !ts.isVariableDeclaration(variable) || variable.initializer === undefined) {
        return false;
      }
      const exportedName = bindingElementPropertyName(declaration);
      const moduleReference = commonJsModuleReference(variable.initializer, checker, nextSeen);
      return (
        exportedName !== undefined &&
        moduleReference !== undefined &&
        moduleExportsMigrationTransaction(moduleReference, exportedName, checker, program)
      );
    }
    return false;
  });
}

function migratorConstructorProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(expression);
  const directSymbol = checker.getSymbolAtLocation(unwrapped);
  if (migratorClassSymbol(directSymbol, checker)) return true;

  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const exportedName = ts.isPropertyAccessExpression(unwrapped)
      ? unwrapped.name.text
      : moduleText(unwrapped.argumentExpression);
    const moduleReference = commonJsModuleReference(unwrapped.expression, checker, seenSymbols);
    if (
      exportedName !== undefined &&
      moduleReference !== undefined &&
      moduleExportsMigrator(moduleReference, exportedName, checker, program)
    ) {
      return true;
    }
  }

  if (directSymbol === undefined || seenSymbols.has(directSymbol)) return false;
  const nextSeen = new Set(seenSymbols).add(directSymbol);
  if ((directSymbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(directSymbol);
    if (migratorClassSymbol(aliased, checker)) return true;
  }
  return (directSymbol.declarations ?? []).some(declaration => {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
      return migratorConstructorProvenance(declaration.initializer, checker, program, nextSeen);
    }
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent;
      const variable =
        ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern) ? pattern.parent : undefined;
      if (variable === undefined || !ts.isVariableDeclaration(variable) || variable.initializer === undefined) {
        return false;
      }
      const exportedName = bindingElementPropertyName(declaration);
      const moduleReference = commonJsModuleReference(variable.initializer, checker, nextSeen);
      return (
        exportedName !== undefined &&
        moduleReference !== undefined &&
        moduleExportsMigrator(moduleReference, exportedName, checker, program)
      );
    }
    return false;
  });
}

function currentMigrationPipelineConstructorProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(expression);
  const directSymbol = checker.getSymbolAtLocation(unwrapped);
  if (currentMigrationPipelineClassSymbol(directSymbol, checker)) return true;

  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const exportedName = ts.isPropertyAccessExpression(unwrapped)
      ? unwrapped.name.text
      : moduleText(unwrapped.argumentExpression);
    const moduleReference = commonJsModuleReference(unwrapped.expression, checker, seenSymbols);
    if (
      exportedName !== undefined &&
      moduleReference !== undefined &&
      moduleExportsCurrentMigrationPipeline(moduleReference, exportedName, checker, program)
    ) {
      return true;
    }
  }

  if (directSymbol === undefined || seenSymbols.has(directSymbol)) return false;
  const nextSeen = new Set(seenSymbols).add(directSymbol);
  if ((directSymbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(directSymbol);
    if (currentMigrationPipelineClassSymbol(aliased, checker)) return true;
  }
  return (directSymbol.declarations ?? []).some(declaration => {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
      return currentMigrationPipelineConstructorProvenance(declaration.initializer, checker, program, nextSeen);
    }
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent;
      const variable =
        ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern) ? pattern.parent : undefined;
      if (variable === undefined || !ts.isVariableDeclaration(variable) || variable.initializer === undefined) {
        return false;
      }
      const exportedName = bindingElementPropertyName(declaration);
      const moduleReference = commonJsModuleReference(variable.initializer, checker, nextSeen);
      return (
        exportedName !== undefined &&
        moduleReference !== undefined &&
        moduleExportsCurrentMigrationPipeline(moduleReference, exportedName, checker, program)
      );
    }
    return false;
  });
}

function migrationTransactionReceiverProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(expression);
  const applyProperty = checker.getPropertyOfType(checker.getTypeAtLocation(unwrapped), 'apply');
  if (transactionApplySymbol(applyProperty)) return true;
  if (ts.isNewExpression(unwrapped)) {
    return migrationTransactionConstructorProvenance(unwrapped.expression, checker, program, seenSymbols);
  }

  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (symbol === undefined || seenSymbols.has(symbol)) return false;
  const nextSeen = new Set(seenSymbols).add(symbol);
  return (symbol.declarations ?? []).some(
    declaration =>
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      migrationTransactionReceiverProvenance(declaration.initializer, checker, program, nextSeen),
  );
}

function migratorReceiverProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(expression);
  const migrateProperty = checker.getPropertyOfType(checker.getTypeAtLocation(unwrapped), 'migrate');
  if (migratorMigrateSymbol(migrateProperty)) return true;
  if (ts.isNewExpression(unwrapped)) {
    return migratorConstructorProvenance(unwrapped.expression, checker, program, seenSymbols);
  }

  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (symbol === undefined || seenSymbols.has(symbol)) return false;
  const nextSeen = new Set(seenSymbols).add(symbol);
  return (symbol.declarations ?? []).some(
    declaration =>
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      migratorReceiverProvenance(declaration.initializer, checker, program, nextSeen),
  );
}

function currentMigrationPipelineReceiverProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(expression);
  const runProperty = checker.getPropertyOfType(checker.getTypeAtLocation(unwrapped), 'run');
  if (currentMigrationPipelineRunSymbol(runProperty)) return true;
  if (ts.isNewExpression(unwrapped)) {
    return currentMigrationPipelineConstructorProvenance(unwrapped.expression, checker, program, seenSymbols);
  }
  if (ts.isConditionalExpression(unwrapped)) {
    return (
      currentMigrationPipelineReceiverProvenance(unwrapped.whenTrue, checker, program, seenSymbols) ||
      currentMigrationPipelineReceiverProvenance(unwrapped.whenFalse, checker, program, seenSymbols)
    );
  }

  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (symbol === undefined || seenSymbols.has(symbol)) return false;
  const nextSeen = new Set(seenSymbols).add(symbol);
  return (symbol.declarations ?? []).some(
    declaration =>
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      currentMigrationPipelineReceiverProvenance(declaration.initializer, checker, program, nextSeen),
  );
}

function transactionApplySymbolProvenance(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  if (symbol === undefined || seenSymbols.has(symbol)) return false;
  if (migratorMigrateSymbol(symbol)) return false;
  const nextSeen = new Set(seenSymbols).add(symbol);
  if (transactionApplySymbol(symbol)) return true;
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    if (transactionApplySymbolProvenance(aliased, checker, program, nextSeen)) return true;
  }
  return (symbol.declarations ?? []).some(declaration => {
    const callableBody = declarationCallableBody(declaration);
    if (callableBody !== undefined && shouldTraceCallableBody(declaration, program)) {
      return callableBodyContainsTransactionApplication(callableBody, checker, program, nextSeen);
    }
    if (
      (ts.isVariableDeclaration(declaration) ||
        ts.isPropertyAssignment(declaration) ||
        ts.isPropertyDeclaration(declaration)) &&
      declaration.initializer !== undefined
    ) {
      return transactionApplyCallableProvenance(declaration.initializer, checker, program, nextSeen);
    }
    if (ts.isShorthandPropertyAssignment(declaration)) {
      return transactionApplySymbolProvenance(
        checker.getShorthandAssignmentValueSymbol(declaration),
        checker,
        program,
        nextSeen,
      );
    }
    if (ts.isExportAssignment(declaration)) {
      return transactionApplyCallableProvenance(declaration.expression, checker, program, nextSeen);
    }
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent;
      const variable =
        ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern) ? pattern.parent : undefined;
      if (variable === undefined || !ts.isVariableDeclaration(variable) || variable.initializer === undefined) {
        return false;
      }
      const propertyName = bindingElementPropertyName(declaration);
      if (propertyName === undefined) return false;
      const moduleReference = commonJsModuleReference(variable.initializer, checker, nextSeen);
      if (moduleReference !== undefined) {
        const exportedSymbol = commonJsExportedSymbol(moduleReference, propertyName, checker, program);
        if (transactionApplySymbolProvenance(exportedSymbol, checker, program, nextSeen)) return true;
      }
      const property = checker.getPropertyOfType(checker.getTypeAtLocation(variable.initializer), propertyName);
      return (
        transactionApplySymbolProvenance(property, checker, program, nextSeen) ||
        (propertyName === 'apply' &&
          migrationTransactionReceiverProvenance(variable.initializer, checker, program, nextSeen))
      );
    }
    return false;
  });
}

function transactionApplyCallableProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(expression);
  if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped)) {
    return callableBodyContainsTransactionApplication(unwrapped.body, checker, program, seenSymbols);
  }
  if (ts.isCallExpression(unwrapped)) {
    const target = unwrapExpression(unwrapped.expression);
    if (
      (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) &&
      resolvedMemberName(target, checker) === 'bind'
    ) {
      return transactionApplyCallableProvenance(target.expression, checker, program, seenSymbols);
    }
    return false;
  }

  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const name = resolvedMemberName(unwrapped, checker);
    const moduleReference = commonJsModuleReference(unwrapped.expression, checker, seenSymbols);
    if (name !== undefined && moduleReference !== undefined) {
      const exportedSymbol = commonJsExportedSymbol(moduleReference, name, checker, program);
      if (transactionApplySymbolProvenance(exportedSymbol, checker, program, seenSymbols)) return true;
    }
    if (name === 'apply') {
      const property = checker.getPropertyOfType(checker.getTypeAtLocation(unwrapped.expression), name);
      if (
        transactionApplySymbol(property) ||
        migrationTransactionReceiverProvenance(unwrapped.expression, checker, program, seenSymbols)
      ) {
        return true;
      }
    }
    if (
      name === undefined &&
      ts.isElementAccessExpression(unwrapped) &&
      migrationTransactionReceiverProvenance(unwrapped.expression, checker, program, seenSymbols)
    ) {
      return true;
    }
    const propertyNode = ts.isPropertyAccessExpression(unwrapped) ? unwrapped.name : unwrapped.argumentExpression;
    if (
      propertyNode !== undefined &&
      transactionApplySymbolProvenance(checker.getSymbolAtLocation(propertyNode), checker, program, seenSymbols)
    ) {
      return true;
    }
  }

  const symbol = checker.getSymbolAtLocation(unwrapped);
  return transactionApplySymbolProvenance(symbol, checker, program, seenSymbols);
}

function transactionApplicationInvocation(
  expression: ts.CallExpression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const reflected = reflectedApplyInvocation(expression, checker, program, seenSymbols);
  if (reflected !== undefined) {
    const invocation = resolvedCallableApplication(reflected.target, reflected.arguments, checker, target =>
      transactionApplyCallableProvenance(target, checker, program, seenSymbols) ? true : undefined,
    );
    if (invocation !== undefined) return true;
  }
  return (
    resolvedCallableInvocation(expression, checker, target =>
      transactionApplyCallableProvenance(target, checker, program, seenSymbols) ? true : undefined,
    ) !== undefined
  );
}

type MigrationModeLiteral = 'plan' | 'write';
type MigrationOptionsMode = MigrationModeLiteral | 'absent' | 'unknown';

function isConstVariableDeclaration(declaration: ts.VariableDeclaration): boolean {
  return ts.isVariableDeclarationList(declaration.parent) && (declaration.parent.flags & ts.NodeFlags.Const) !== 0;
}

function isConstAssertion(expression: ts.Expression): boolean {
  let current = expression;
  while (ts.isParenthesizedExpression(current) || ts.isSatisfiesExpression(current)) {
    current = current.expression;
  }
  if (!ts.isAsExpression(current) && !ts.isTypeAssertionExpression(current)) return false;
  return (
    ts.isTypeReferenceNode(current.type) &&
    ts.isIdentifier(current.type.typeName) &&
    current.type.typeName.text === 'const'
  );
}

function migrationModeLiteral(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): MigrationModeLiteral | undefined {
  const unwrapped = unwrapExpression(expression);
  if (ts.isStringLiteralLike(unwrapped)) {
    return unwrapped.text === 'plan' || unwrapped.text === 'write' ? unwrapped.text : undefined;
  }
  const type = checker.getTypeAtLocation(unwrapped);
  if (type.isStringLiteral() && (type.value === 'plan' || type.value === 'write')) return type.value;

  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (symbol === undefined || seenSymbols.has(symbol)) return undefined;
  const nextSeen = new Set(seenSymbols).add(symbol);
  for (const declaration of symbol.declarations ?? []) {
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      isConstVariableDeclaration(declaration)
    ) {
      const mode = migrationModeLiteral(declaration.initializer, checker, nextSeen);
      if (mode !== undefined) return mode;
    }
  }
  return undefined;
}

function migrationModeFromOptions(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): MigrationOptionsMode {
  const unwrapped = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(unwrapped)) {
    let mode: MigrationOptionsMode = 'absent';
    for (const property of unwrapped.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spreadMode = migrationModeFromOptions(property.expression, checker, seenSymbols);
        if (spreadMode !== 'absent') mode = spreadMode;
        continue;
      }
      const propertyName = objectPropertyName(property);
      if (propertyName === undefined && ts.isComputedPropertyName(property.name)) {
        mode = 'unknown';
        continue;
      }
      if (propertyName !== 'mode') continue;
      if (ts.isPropertyAssignment(property)) {
        mode = migrationModeLiteral(property.initializer, checker, seenSymbols) ?? 'unknown';
      } else if (ts.isShorthandPropertyAssignment(property)) {
        mode = migrationModeLiteral(property.name, checker, seenSymbols) ?? 'unknown';
      } else {
        mode = 'unknown';
      }
    }
    return mode;
  }

  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (symbol === undefined || seenSymbols.has(symbol)) return 'unknown';
  const nextSeen = new Set(seenSymbols).add(symbol);
  for (const declaration of symbol.declarations ?? []) {
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      isConstVariableDeclaration(declaration) &&
      isConstAssertion(declaration.initializer)
    ) {
      return migrationModeFromOptions(declaration.initializer, checker, nextSeen);
    }
  }
  return 'unknown';
}

function migrationInvocationCanWrite(options: ts.Expression | undefined, checker: ts.TypeChecker): boolean {
  if (options === undefined) return false;
  const unwrapped = unwrapExpression(options);
  if (ts.isIdentifier(unwrapped) && unwrapped.text === 'undefined') return false;
  return migrationModeFromOptions(unwrapped, checker) !== 'plan';
}

interface MigratorMigrateCallableProvenance {
  readonly boundArguments: readonly ts.Expression[];
}

function migratorMigrateSymbolProvenance(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol>,
): MigratorMigrateCallableProvenance | undefined {
  if (symbol === undefined || seenSymbols.has(symbol)) return undefined;
  const nextSeen = new Set(seenSymbols).add(symbol);
  if (migratorMigrateSymbol(symbol)) return { boundArguments: [] };
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    const provenance = migratorMigrateSymbolProvenance(aliased, checker, program, nextSeen);
    if (provenance !== undefined) return provenance;
  }
  for (const declaration of symbol.declarations ?? []) {
    if (
      (ts.isVariableDeclaration(declaration) ||
        ts.isPropertyAssignment(declaration) ||
        ts.isPropertyDeclaration(declaration)) &&
      declaration.initializer !== undefined
    ) {
      const provenance = migratorMigrateCallableProvenance(declaration.initializer, checker, program, nextSeen);
      if (provenance !== undefined) return provenance;
    }
    if (ts.isShorthandPropertyAssignment(declaration)) {
      const provenance = migratorMigrateSymbolProvenance(
        checker.getShorthandAssignmentValueSymbol(declaration),
        checker,
        program,
        nextSeen,
      );
      if (provenance !== undefined) return provenance;
    }
    if (ts.isExportAssignment(declaration)) {
      const provenance = migratorMigrateCallableProvenance(declaration.expression, checker, program, nextSeen);
      if (provenance !== undefined) return provenance;
    }
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent;
      const variable =
        ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern) ? pattern.parent : undefined;
      if (variable === undefined || !ts.isVariableDeclaration(variable) || variable.initializer === undefined) {
        continue;
      }
      const propertyName = bindingElementPropertyName(declaration);
      if (propertyName === undefined) continue;
      const property = checker.getPropertyOfType(checker.getTypeAtLocation(variable.initializer), propertyName);
      const provenance = migratorMigrateSymbolProvenance(property, checker, program, nextSeen);
      if (provenance !== undefined) return provenance;
      if (propertyName === 'migrate' && migratorReceiverProvenance(variable.initializer, checker, program, nextSeen)) {
        return { boundArguments: [] };
      }
    }
  }
  return undefined;
}

function migratorMigrateCallableProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): MigratorMigrateCallableProvenance | undefined {
  const unwrapped = unwrapExpression(expression);
  if (ts.isCallExpression(unwrapped)) {
    const target = unwrapExpression(unwrapped.expression);
    if (
      (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) &&
      resolvedMemberName(target, checker) === 'bind'
    ) {
      const provenance = migratorMigrateCallableProvenance(target.expression, checker, program, seenSymbols);
      return provenance === undefined
        ? undefined
        : { boundArguments: [...provenance.boundArguments, ...unwrapped.arguments.slice(1)] };
    }
    return undefined;
  }

  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const name = resolvedMemberName(unwrapped, checker);
    if (name === 'migrate') {
      const property = checker.getPropertyOfType(checker.getTypeAtLocation(unwrapped.expression), name);
      if (migratorMigrateSymbol(property) || migratorReceiverProvenance(unwrapped.expression, checker, program)) {
        return { boundArguments: [] };
      }
    }
    if (
      name === undefined &&
      ts.isElementAccessExpression(unwrapped) &&
      migratorReceiverProvenance(unwrapped.expression, checker, program, seenSymbols)
    ) {
      return { boundArguments: [] };
    }
    const propertyNode = ts.isPropertyAccessExpression(unwrapped) ? unwrapped.name : unwrapped.argumentExpression;
    if (propertyNode !== undefined) {
      const provenance = migratorMigrateSymbolProvenance(
        checker.getSymbolAtLocation(propertyNode),
        checker,
        program,
        seenSymbols,
      );
      if (provenance !== undefined) return provenance;
    }
  }

  return migratorMigrateSymbolProvenance(checker.getSymbolAtLocation(unwrapped), checker, program, seenSymbols);
}

function migrationModeFromPipelineInvocation(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): MigrationOptionsMode {
  const unwrapped = unwrapExpression(expression);
  if (ts.isObjectLiteralExpression(unwrapped)) {
    let mode: MigrationOptionsMode = 'absent';
    for (const property of unwrapped.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spreadMode = migrationModeFromPipelineInvocation(property.expression, checker, seenSymbols);
        if (spreadMode !== 'absent') mode = spreadMode;
        continue;
      }
      const propertyName = objectPropertyName(property);
      if (propertyName === undefined && ts.isComputedPropertyName(property.name)) {
        mode = 'unknown';
        continue;
      }
      if (propertyName !== 'options') continue;
      if (ts.isPropertyAssignment(property)) {
        mode = migrationModeFromOptions(property.initializer, checker, seenSymbols);
      } else if (ts.isShorthandPropertyAssignment(property)) {
        mode = migrationModeFromOptions(property.name, checker, seenSymbols);
      } else {
        mode = 'unknown';
      }
    }
    return mode;
  }

  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (symbol === undefined || seenSymbols.has(symbol)) return 'unknown';
  const nextSeen = new Set(seenSymbols).add(symbol);
  for (const declaration of symbol.declarations ?? []) {
    if (
      ts.isVariableDeclaration(declaration) &&
      declaration.initializer !== undefined &&
      isConstVariableDeclaration(declaration) &&
      isConstAssertion(declaration.initializer)
    ) {
      return migrationModeFromPipelineInvocation(declaration.initializer, checker, nextSeen);
    }
  }
  return 'unknown';
}

function currentPipelineInvocationCanWrite(invocation: ts.Expression | undefined, checker: ts.TypeChecker): boolean {
  if (invocation === undefined) return true;
  const unwrapped = unwrapExpression(invocation);
  if (ts.isIdentifier(unwrapped) && unwrapped.text === 'undefined') return true;
  return migrationModeFromPipelineInvocation(unwrapped, checker) !== 'plan';
}

interface CurrentMigrationPipelineRunCallableProvenance {
  readonly boundArguments: readonly ts.Expression[];
}

function currentMigrationPipelineRunSymbolProvenance(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol>,
): CurrentMigrationPipelineRunCallableProvenance | undefined {
  if (symbol === undefined || seenSymbols.has(symbol)) return undefined;
  const nextSeen = new Set(seenSymbols).add(symbol);
  if (currentMigrationPipelineRunSymbol(symbol)) return { boundArguments: [] };
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    const provenance = currentMigrationPipelineRunSymbolProvenance(aliased, checker, program, nextSeen);
    if (provenance !== undefined) return provenance;
  }
  for (const declaration of symbol.declarations ?? []) {
    if (
      (ts.isVariableDeclaration(declaration) ||
        ts.isPropertyAssignment(declaration) ||
        ts.isPropertyDeclaration(declaration)) &&
      declaration.initializer !== undefined
    ) {
      const provenance = currentMigrationPipelineRunCallableProvenance(
        declaration.initializer,
        checker,
        program,
        nextSeen,
      );
      if (provenance !== undefined) return provenance;
    }
    if (ts.isShorthandPropertyAssignment(declaration)) {
      const provenance = currentMigrationPipelineRunSymbolProvenance(
        checker.getShorthandAssignmentValueSymbol(declaration),
        checker,
        program,
        nextSeen,
      );
      if (provenance !== undefined) return provenance;
    }
    if (ts.isExportAssignment(declaration)) {
      const provenance = currentMigrationPipelineRunCallableProvenance(
        declaration.expression,
        checker,
        program,
        nextSeen,
      );
      if (provenance !== undefined) return provenance;
    }
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent;
      const variable =
        ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern) ? pattern.parent : undefined;
      if (variable === undefined || !ts.isVariableDeclaration(variable) || variable.initializer === undefined) {
        continue;
      }
      const propertyName = bindingElementPropertyName(declaration);
      if (propertyName === undefined) continue;
      const property = checker.getPropertyOfType(checker.getTypeAtLocation(variable.initializer), propertyName);
      const provenance = currentMigrationPipelineRunSymbolProvenance(property, checker, program, nextSeen);
      if (provenance !== undefined) return provenance;
      if (
        propertyName === 'run' &&
        currentMigrationPipelineReceiverProvenance(variable.initializer, checker, program, nextSeen)
      ) {
        return { boundArguments: [] };
      }
    }
  }
  return undefined;
}

function currentMigrationPipelineRunCallableProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): CurrentMigrationPipelineRunCallableProvenance | undefined {
  const unwrapped = unwrapExpression(expression);
  if (ts.isCallExpression(unwrapped)) {
    const target = unwrapExpression(unwrapped.expression);
    if (
      (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) &&
      resolvedMemberName(target, checker) === 'bind'
    ) {
      const provenance = currentMigrationPipelineRunCallableProvenance(
        target.expression,
        checker,
        program,
        seenSymbols,
      );
      return provenance === undefined
        ? undefined
        : { boundArguments: [...provenance.boundArguments, ...unwrapped.arguments.slice(1)] };
    }
    return undefined;
  }

  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const name = resolvedMemberName(unwrapped, checker);
    if (name === 'run') {
      const property = checker.getPropertyOfType(checker.getTypeAtLocation(unwrapped.expression), name);
      if (
        currentMigrationPipelineRunSymbol(property) ||
        currentMigrationPipelineReceiverProvenance(unwrapped.expression, checker, program)
      ) {
        return { boundArguments: [] };
      }
    }
    if (
      name === undefined &&
      ts.isElementAccessExpression(unwrapped) &&
      currentMigrationPipelineReceiverProvenance(unwrapped.expression, checker, program)
    ) {
      return { boundArguments: [] };
    }
    const propertyNode = ts.isPropertyAccessExpression(unwrapped) ? unwrapped.name : unwrapped.argumentExpression;
    if (propertyNode !== undefined) {
      const provenance = currentMigrationPipelineRunSymbolProvenance(
        checker.getSymbolAtLocation(propertyNode),
        checker,
        program,
        seenSymbols,
      );
      if (provenance !== undefined) return provenance;
    }
  }

  return currentMigrationPipelineRunSymbolProvenance(
    checker.getSymbolAtLocation(unwrapped),
    checker,
    program,
    seenSymbols,
  );
}

function currentPipelineWriteSymbolProvenance(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  if (symbol === undefined || seenSymbols.has(symbol)) return false;
  const nextSeen = new Set(seenSymbols).add(symbol);
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    if (currentPipelineWriteSymbolProvenance(aliased, checker, program, nextSeen)) return true;
  }
  return (symbol.declarations ?? []).some(declaration => {
    const callableBody = declarationCallableBody(declaration);
    if (callableBody !== undefined && shouldTraceCallableBody(declaration, program)) {
      return callableBodyContainsCurrentPipelineWrite(callableBody, checker, program, nextSeen);
    }
    if (
      (ts.isVariableDeclaration(declaration) ||
        ts.isPropertyAssignment(declaration) ||
        ts.isPropertyDeclaration(declaration)) &&
      declaration.initializer !== undefined
    ) {
      return currentPipelineWriteCallableProvenance(declaration.initializer, checker, program, nextSeen);
    }
    if (ts.isShorthandPropertyAssignment(declaration)) {
      return currentPipelineWriteSymbolProvenance(
        checker.getShorthandAssignmentValueSymbol(declaration),
        checker,
        program,
        nextSeen,
      );
    }
    if (ts.isExportAssignment(declaration)) {
      return currentPipelineWriteCallableProvenance(declaration.expression, checker, program, nextSeen);
    }
    return false;
  });
}

function currentPipelineWriteCallableProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(expression);
  if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped)) {
    return callableBodyContainsCurrentPipelineWrite(unwrapped.body, checker, program, seenSymbols);
  }
  return currentPipelineWriteSymbolProvenance(checker.getSymbolAtLocation(unwrapped), checker, program, seenSymbols);
}

function boundCurrentPipelineInvocationCanWrite(
  provenance: CurrentMigrationPipelineRunCallableProvenance,
  callArguments: readonly ts.Expression[],
  checker: ts.TypeChecker,
): boolean {
  return currentPipelineInvocationCanWrite([...provenance.boundArguments, ...callArguments][0], checker);
}

function currentPipelineWriteInvocation(
  expression: ts.CallExpression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const reflected = reflectedApplyInvocation(expression, checker, program, seenSymbols);
  if (reflected !== undefined) {
    const invocation = resolvedCallableApplication(reflected.target, reflected.arguments, checker, target =>
      currentMigrationPipelineRunCallableProvenance(target, checker, program, seenSymbols),
    );
    if (invocation !== undefined) {
      return invocation.arguments === undefined
        ? true
        : boundCurrentPipelineInvocationCanWrite(invocation.provenance, invocation.arguments, checker);
    }
    return currentPipelineWriteCallableProvenance(reflected.target, checker, program, seenSymbols);
  }
  const invocation = resolvedCallableInvocation(expression, checker, target =>
    currentMigrationPipelineRunCallableProvenance(target, checker, program, seenSymbols),
  );
  if (invocation !== undefined) {
    return invocation.arguments === undefined
      ? true
      : boundCurrentPipelineInvocationCanWrite(invocation.provenance, invocation.arguments, checker);
  }
  return currentPipelineWriteCallableProvenance(expression.expression, checker, program, seenSymbols);
}

function migrationWriteSymbolProvenance(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  if (symbol === undefined || seenSymbols.has(symbol)) return false;
  if (currentMigrationPipelineRunSymbol(symbol)) return false;
  const nextSeen = new Set(seenSymbols).add(symbol);
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    if (migrationWriteSymbolProvenance(aliased, checker, program, nextSeen)) return true;
  }
  return (symbol.declarations ?? []).some(declaration => {
    const callableBody = declarationCallableBody(declaration);
    if (callableBody !== undefined && shouldTraceCallableBody(declaration, program)) {
      return callableBodyContainsMigrationWrite(callableBody, checker, program, nextSeen);
    }
    if (
      (ts.isVariableDeclaration(declaration) ||
        ts.isPropertyAssignment(declaration) ||
        ts.isPropertyDeclaration(declaration)) &&
      declaration.initializer !== undefined
    ) {
      return migrationWriteCallableProvenance(declaration.initializer, checker, program, nextSeen);
    }
    if (ts.isShorthandPropertyAssignment(declaration)) {
      return migrationWriteSymbolProvenance(
        checker.getShorthandAssignmentValueSymbol(declaration),
        checker,
        program,
        nextSeen,
      );
    }
    if (ts.isExportAssignment(declaration)) {
      return migrationWriteCallableProvenance(declaration.expression, checker, program, nextSeen);
    }
    return false;
  });
}

function migrationWriteCallableProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(expression);
  if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped)) {
    return callableBodyContainsMigrationWrite(unwrapped.body, checker, program, seenSymbols);
  }
  return migrationWriteSymbolProvenance(checker.getSymbolAtLocation(unwrapped), checker, program, seenSymbols);
}

function boundMigrationInvocationCanWrite(
  provenance: MigratorMigrateCallableProvenance,
  callArguments: readonly ts.Expression[],
  checker: ts.TypeChecker,
): boolean {
  return migrationInvocationCanWrite([...provenance.boundArguments, ...callArguments][0], checker);
}

function migrationWriteInvocation(
  expression: ts.CallExpression,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const reflected = reflectedApplyInvocation(expression, checker, program, seenSymbols);
  if (reflected !== undefined) {
    const invocation = resolvedCallableApplication(reflected.target, reflected.arguments, checker, target =>
      migratorMigrateCallableProvenance(target, checker, program, seenSymbols),
    );
    if (invocation !== undefined) {
      return invocation.arguments === undefined
        ? true
        : boundMigrationInvocationCanWrite(invocation.provenance, invocation.arguments, checker);
    }
    return migrationWriteCallableProvenance(reflected.target, checker, program, seenSymbols);
  }
  const invocation = resolvedCallableInvocation(expression, checker, target =>
    migratorMigrateCallableProvenance(target, checker, program, seenSymbols),
  );
  if (invocation !== undefined) {
    return invocation.arguments === undefined
      ? true
      : boundMigrationInvocationCanWrite(invocation.provenance, invocation.arguments, checker);
  }
  return migrationWriteCallableProvenance(expression.expression, checker, program, seenSymbols);
}

interface SemanticAuthorityDeclaration {
  readonly sourcePathSuffix: string;
  readonly containers?: readonly string[];
}

interface SemanticAuthorityConfig {
  readonly name: SemanticAuthorityName;
  readonly methodName: string;
  readonly declarations: readonly SemanticAuthorityDeclaration[];
  readonly concreteClass?: {
    readonly exportedName: string;
    readonly sourcePathSuffix: string;
  };
}

const semanticAuthorityConfigs: readonly SemanticAuthorityConfig[] = [
  {
    name: 'CurrentMigrationPipeline.run',
    methodName: 'run',
    declarations: [
      {
        sourcePathSuffix: '/pipeline/current-migration.pipeline.ts',
        containers: ['CurrentMigrationPipeline', 'MigrationRunner'],
      },
    ],
    concreteClass: {
      exportedName: 'CurrentMigrationPipeline',
      sourcePathSuffix: '/pipeline/current-migration.pipeline.ts',
    },
  },
  {
    name: 'DiscoverProjectStage.run',
    methodName: 'run',
    declarations: [
      {
        sourcePathSuffix: '/pipeline/discover/discover-project.stage.ts',
        containers: ['DiscoverProjectStage'],
      },
    ],
    concreteClass: {
      exportedName: 'DiscoverProjectStage',
      sourcePathSuffix: '/pipeline/discover/discover-project.stage.ts',
    },
  },
  {
    name: 'AnalyzeProjectStage.run',
    methodName: 'run',
    declarations: [
      {
        sourcePathSuffix: '/pipeline/analyze/analyze-project.stage.ts',
        containers: ['AnalyzeProjectStage'],
      },
    ],
    concreteClass: {
      exportedName: 'AnalyzeProjectStage',
      sourcePathSuffix: '/pipeline/analyze/analyze-project.stage.ts',
    },
  },
  {
    name: 'Migrator.migrate',
    methodName: 'migrate',
    declarations: [{ sourcePathSuffix: '/migrator/migrator.ts', containers: ['Migrator'] }],
    concreteClass: { exportedName: 'Migrator', sourcePathSuffix: '/migrator/migrator.ts' },
  },
  {
    name: 'MigrationTransaction.apply',
    methodName: 'apply',
    declarations: [{ sourcePathSuffix: '/transaction/migration-transaction.ts', containers: ['MigrationTransaction'] }],
    concreteClass: {
      exportedName: 'MigrationTransaction',
      sourcePathSuffix: '/transaction/migration-transaction.ts',
    },
  },
  {
    name: 'DiscoveryFileSystem.kind',
    methodName: 'kind',
    declarations: [
      {
        sourcePathSuffix: '/pipeline/discover/discovery-file-system.port.ts',
        containers: ['DiscoveryFileSystem'],
      },
    ],
  },
  {
    name: 'DiscoveryFileSystem.entries',
    methodName: 'entries',
    declarations: [
      {
        sourcePathSuffix: '/pipeline/discover/discovery-file-system.port.ts',
        containers: ['DiscoveryFileSystem'],
      },
    ],
  },
  {
    name: 'IgnoreMatcherFactory.load',
    methodName: 'load',
    declarations: [
      {
        sourcePathSuffix: '/pipeline/discover/ignore-matcher.port.ts',
        containers: ['IgnoreMatcherFactory'],
      },
    ],
  },
  {
    name: 'GitIgnoreHelper.createGitIgnoreMatcher',
    methodName: 'createGitIgnoreMatcher',
    declarations: [{ sourcePathSuffix: '/lib/gitignore.helper.ts' }],
  },
  {
    name: 'TemplateSourceReader.read',
    methodName: 'read',
    declarations: [
      {
        sourcePathSuffix: '/pipeline/analyze/template-source-reader.port.ts',
        containers: ['TemplateSourceReader'],
      },
    ],
  },
  {
    name: 'DestinationTemplateSource.read',
    methodName: 'read',
    declarations: [
      {
        sourcePathSuffix: '/migrator/destination-template-source.ts',
        containers: ['DestinationTemplateSource'],
      },
    ],
  },
  {
    name: 'AngularTemplateParser.parse',
    methodName: 'parse',
    declarations: [
      { sourcePathSuffix: '/pipeline/analyze/template-parser.port.ts', containers: ['TemplateParser'] },
      { sourcePathSuffix: '/template/angular-template.parser.ts', containers: ['AngularTemplateParser'] },
    ],
    concreteClass: {
      exportedName: 'AngularTemplateParser',
      sourcePathSuffix: '/template/angular-template.parser.ts',
    },
  },
  {
    name: 'TemplateInputAnalyzer.analyze',
    methodName: 'analyze',
    declarations: [
      {
        sourcePathSuffix: '/pipeline/analyze/template-input-analyzer.port.ts',
        containers: ['TemplateInputAnalyzer'],
      },
      { sourcePathSuffix: '/analyzer/template.analyzer.ts', containers: ['TemplateAnalyzer'] },
    ],
    concreteClass: { exportedName: 'TemplateAnalyzer', sourcePathSuffix: '/analyzer/template.analyzer.ts' },
  },
];

function enclosingDeclarationContainerName(declaration: ts.Declaration): string | undefined {
  for (let current: ts.Node | undefined = declaration.parent; current !== undefined; current = current.parent) {
    if (ts.isClassDeclaration(current) || ts.isInterfaceDeclaration(current)) return current.name?.text;
  }
  return undefined;
}

function semanticAuthorityMethodSymbol(symbol: ts.Symbol | undefined, config: SemanticAuthorityConfig): boolean {
  if (symbol?.getName() !== config.methodName) return false;
  return (
    symbol.declarations?.some(declaration => {
      const sourcePath = normalizedDeclarationPath(declaration);
      const container = enclosingDeclarationContainerName(declaration);
      return config.declarations.some(
        owner =>
          sourcePath.endsWith(owner.sourcePathSuffix) &&
          (owner.containers === undefined
            ? container === undefined
            : container !== undefined && owner.containers.includes(container)),
      );
    }) === true
  );
}

function semanticAuthorityClassSymbol(
  symbol: ts.Symbol | undefined,
  config: SemanticAuthorityConfig,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const concreteClass = config.concreteClass;
  if (symbol === undefined || concreteClass === undefined || seenSymbols.has(symbol)) return false;
  const nextSeen = new Set(seenSymbols).add(symbol);
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    if (aliased !== symbol && semanticAuthorityClassSymbol(aliased, config, checker, nextSeen)) return true;
  }
  return (
    symbol.getName() === concreteClass.exportedName &&
    symbol.declarations?.some(
      declaration =>
        ts.isClassDeclaration(declaration) &&
        normalizedDeclarationPath(declaration).endsWith(concreteClass.sourcePathSuffix),
    ) === true
  );
}

function moduleExportsSemanticAuthorityClass(
  moduleReference: CommonJsModuleReference,
  exportedName: string,
  config: SemanticAuthorityConfig,
  checker: ts.TypeChecker,
  program: ts.Program,
): boolean {
  const concreteClass = config.concreteClass;
  if (concreteClass === undefined) return false;
  const candidates = localModuleCandidates(moduleReference.reference, moduleReference.containingSourcePath);
  if (
    exportedName === concreteClass.exportedName &&
    candidates.some(candidate => candidate.replaceAll('\\', '/').endsWith(concreteClass.sourcePathSuffix))
  ) {
    return true;
  }
  return semanticAuthorityClassSymbol(
    commonJsExportedSymbol(moduleReference, exportedName, checker, program),
    config,
    checker,
  );
}

function moduleExportsSemanticAuthorityCallable(
  moduleReference: CommonJsModuleReference,
  exportedName: string,
  config: SemanticAuthorityConfig,
  checker: ts.TypeChecker,
  program: ts.Program,
): boolean {
  const candidates = localModuleCandidates(moduleReference.reference, moduleReference.containingSourcePath);
  if (
    exportedName === config.methodName &&
    config.declarations.some(owner =>
      candidates.some(candidate => candidate.replaceAll('\\', '/').endsWith(owner.sourcePathSuffix)),
    )
  ) {
    return true;
  }
  return semanticAuthoritySymbolProvenance(
    commonJsExportedSymbol(moduleReference, exportedName, checker, program),
    config,
    checker,
    program,
    new Set(),
  );
}

function semanticAuthorityConstructorProvenance(
  expression: ts.Expression,
  config: SemanticAuthorityConfig,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(expression);
  const directSymbol = checker.getSymbolAtLocation(unwrapped);
  if (semanticAuthorityClassSymbol(directSymbol, config, checker)) return true;

  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const exportedName = resolvedMemberName(unwrapped, checker);
    const moduleReference = commonJsModuleReference(unwrapped.expression, checker, seenSymbols);
    if (
      exportedName !== undefined &&
      moduleReference !== undefined &&
      moduleExportsSemanticAuthorityClass(moduleReference, exportedName, config, checker, program)
    ) {
      return true;
    }
  }

  if (directSymbol === undefined || seenSymbols.has(directSymbol)) return false;
  const nextSeen = new Set(seenSymbols).add(directSymbol);
  if ((directSymbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(directSymbol);
    if (semanticAuthorityClassSymbol(aliased, config, checker)) return true;
  }
  return (directSymbol.declarations ?? []).some(declaration => {
    if (ts.isVariableDeclaration(declaration) && declaration.initializer !== undefined) {
      return semanticAuthorityConstructorProvenance(declaration.initializer, config, checker, program, nextSeen);
    }
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent;
      const variable =
        ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern) ? pattern.parent : undefined;
      if (variable === undefined || !ts.isVariableDeclaration(variable) || variable.initializer === undefined) {
        return false;
      }
      const exportedName = bindingElementPropertyName(declaration);
      const moduleReference = commonJsModuleReference(variable.initializer, checker, nextSeen);
      return (
        exportedName !== undefined &&
        moduleReference !== undefined &&
        moduleExportsSemanticAuthorityClass(moduleReference, exportedName, config, checker, program)
      );
    }
    return false;
  });
}

function semanticAuthorityReceiverProvenance(
  expression: ts.Expression,
  config: SemanticAuthorityConfig,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(expression);
  const property = checker.getPropertyOfType(checker.getTypeAtLocation(unwrapped), config.methodName);
  if (semanticAuthorityMethodSymbol(property, config)) return true;
  if (ts.isNewExpression(unwrapped)) {
    return semanticAuthorityConstructorProvenance(unwrapped.expression, config, checker, program, seenSymbols);
  }
  if (ts.isConditionalExpression(unwrapped)) {
    return (
      semanticAuthorityReceiverProvenance(unwrapped.whenTrue, config, checker, program, seenSymbols) ||
      semanticAuthorityReceiverProvenance(unwrapped.whenFalse, config, checker, program, seenSymbols)
    );
  }

  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (symbol === undefined || seenSymbols.has(symbol)) return false;
  const nextSeen = new Set(seenSymbols).add(symbol);
  return (symbol.declarations ?? []).some(
    declaration =>
      (ts.isVariableDeclaration(declaration) || ts.isParameter(declaration)) &&
      declaration.initializer !== undefined &&
      semanticAuthorityReceiverProvenance(declaration.initializer, config, checker, program, nextSeen),
  );
}

function semanticAuthoritySymbolProvenance(
  symbol: ts.Symbol | undefined,
  config: SemanticAuthorityConfig,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  if (symbol === undefined || seenSymbols.has(symbol)) return false;
  const nextSeen = new Set(seenSymbols).add(symbol);
  if (semanticAuthorityMethodSymbol(symbol, config)) return true;
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    if (semanticAuthoritySymbolProvenance(aliased, config, checker, program, nextSeen)) return true;
  }
  return (symbol.declarations ?? []).some(declaration => {
    const callableBody = declarationCallableBody(declaration);
    if (callableBody !== undefined && shouldTraceCallableBody(declaration, program)) {
      return callableBodyContainsSemanticAuthority(callableBody, config, checker, program, nextSeen);
    }
    if (
      (ts.isVariableDeclaration(declaration) ||
        ts.isPropertyAssignment(declaration) ||
        ts.isPropertyDeclaration(declaration)) &&
      declaration.initializer !== undefined
    ) {
      return semanticAuthorityCallableProvenance(declaration.initializer, config, checker, program, nextSeen);
    }
    if (ts.isShorthandPropertyAssignment(declaration)) {
      return semanticAuthoritySymbolProvenance(
        checker.getShorthandAssignmentValueSymbol(declaration),
        config,
        checker,
        program,
        nextSeen,
      );
    }
    if (ts.isExportAssignment(declaration)) {
      return semanticAuthorityCallableProvenance(declaration.expression, config, checker, program, nextSeen);
    }
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent;
      const variable =
        ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern) ? pattern.parent : undefined;
      if (variable === undefined || !ts.isVariableDeclaration(variable) || variable.initializer === undefined) {
        return false;
      }
      const propertyName = bindingElementPropertyName(declaration);
      if (propertyName === undefined) return false;
      const moduleReference = commonJsModuleReference(variable.initializer, checker, nextSeen);
      if (moduleReference !== undefined) {
        if (moduleExportsSemanticAuthorityCallable(moduleReference, propertyName, config, checker, program))
          return true;
      }
      const property = checker.getPropertyOfType(checker.getTypeAtLocation(variable.initializer), propertyName);
      return semanticAuthoritySymbolProvenance(property, config, checker, program, nextSeen);
    }
    return false;
  });
}

function semanticAuthorityCallableProvenance(
  expression: ts.Expression,
  config: SemanticAuthorityConfig,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(expression);
  if (ts.isArrowFunction(unwrapped) || ts.isFunctionExpression(unwrapped)) {
    return callableBodyContainsSemanticAuthority(unwrapped.body, config, checker, program, seenSymbols);
  }
  if (ts.isCallExpression(unwrapped)) {
    const target = unwrapExpression(unwrapped.expression);
    if (
      (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) &&
      resolvedMemberName(target, checker) === 'bind'
    ) {
      return semanticAuthorityCallableProvenance(target.expression, config, checker, program, seenSymbols);
    }
    return false;
  }

  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const name = resolvedMemberName(unwrapped, checker);
    const moduleReference = commonJsModuleReference(unwrapped.expression, checker, seenSymbols);
    if (name !== undefined && moduleReference !== undefined) {
      if (moduleExportsSemanticAuthorityCallable(moduleReference, name, config, checker, program)) return true;
    }
    if (
      (name === config.methodName || (name === undefined && ts.isElementAccessExpression(unwrapped))) &&
      semanticAuthorityReceiverProvenance(unwrapped.expression, config, checker, program, seenSymbols)
    ) {
      return true;
    }
    const propertyNode = ts.isPropertyAccessExpression(unwrapped) ? unwrapped.name : unwrapped.argumentExpression;
    if (
      propertyNode !== undefined &&
      semanticAuthoritySymbolProvenance(
        checker.getSymbolAtLocation(propertyNode),
        config,
        checker,
        program,
        seenSymbols,
      )
    ) {
      return true;
    }
  }

  return semanticAuthoritySymbolProvenance(
    checker.getSymbolAtLocation(unwrapped),
    config,
    checker,
    program,
    seenSymbols,
  );
}

function semanticAuthorityInvocation(
  expression: ts.CallExpression,
  config: SemanticAuthorityConfig,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  if (config.name === 'MigrationTransaction.apply') {
    return transactionApplicationInvocation(expression, checker, program, seenSymbols);
  }
  const directTarget = unwrapExpression(expression.expression);
  if (
    (ts.isPropertyAccessExpression(directTarget) || ts.isElementAccessExpression(directTarget)) &&
    resolvedMemberName(directTarget, checker) === 'bind'
  ) {
    return false;
  }
  const reflected = reflectedApplyInvocation(expression, checker, program, seenSymbols);
  if (reflected !== undefined) {
    const invocation = resolvedCallableApplication(reflected.target, reflected.arguments, checker, target =>
      semanticAuthorityCallableProvenance(target, config, checker, program, seenSymbols) ? true : undefined,
    );
    if (invocation !== undefined) return true;
  }
  return (
    resolvedCallableInvocation(expression, checker, target =>
      semanticAuthorityCallableProvenance(target, config, checker, program, seenSymbols) ? true : undefined,
    ) !== undefined
  );
}

function callableBodyContainsSemanticAuthority(
  body: ts.ConciseBody,
  config: SemanticAuthorityConfig,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (found) return;
    if (ts.isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
    if (ts.isCallExpression(node) && semanticAuthorityInvocation(node, config, checker, program, seenSymbols)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  return found;
}

function semanticAuthorityMethodHint(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): string | undefined {
  const unwrapped = unwrapExpression(expression);
  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const name = resolvedMemberName(unwrapped, checker);
    if (name === 'call' || name === 'apply' || name === 'bind') {
      return semanticAuthorityMethodHint(unwrapped.expression, checker, seenSymbols);
    }
    if (semanticAuthorityConfigs.some(config => config.methodName === name)) return name;
    const propertyNode = ts.isPropertyAccessExpression(unwrapped) ? unwrapped.name : unwrapped.argumentExpression;
    const propertySymbol = propertyNode === undefined ? undefined : checker.getSymbolAtLocation(propertyNode);
    if (propertySymbol !== undefined && !seenSymbols.has(propertySymbol)) {
      const nextSeen = new Set(seenSymbols).add(propertySymbol);
      for (const declaration of propertySymbol.declarations ?? []) {
        if (
          (ts.isPropertyAssignment(declaration) || ts.isPropertyDeclaration(declaration)) &&
          declaration.initializer !== undefined
        ) {
          const hint = semanticAuthorityMethodHint(declaration.initializer, checker, nextSeen);
          if (hint !== undefined) return hint;
        }
      }
    }
    return undefined;
  }
  const symbol = checker.getSymbolAtLocation(unwrapped);
  if (symbol === undefined || seenSymbols.has(symbol)) return undefined;
  const nextSeen = new Set(seenSymbols).add(symbol);
  for (const declaration of symbol.declarations ?? []) {
    if (
      (ts.isVariableDeclaration(declaration) ||
        ts.isPropertyAssignment(declaration) ||
        ts.isPropertyDeclaration(declaration)) &&
      declaration.initializer !== undefined
    ) {
      const hint = semanticAuthorityMethodHint(declaration.initializer, checker, nextSeen);
      if (hint !== undefined) return hint;
    }
  }
  return undefined;
}

function semanticAuthorityCandidates(
  expression: ts.CallExpression,
  checker: ts.TypeChecker,
  program: ts.Program,
): readonly SemanticAuthorityConfig[] {
  const reflected = reflectedApplyInvocation(expression, checker, program, new Set());
  const target = reflected?.target ?? expression.expression;
  const hint = semanticAuthorityMethodHint(target, checker);
  if (hint !== undefined) return semanticAuthorityConfigs.filter(config => config.methodName === hint);

  const unwrapped = unwrapExpression(target);
  if (ts.isIdentifier(unwrapped)) {
    const symbol = checker.getSymbolAtLocation(unwrapped);
    const localAlias = symbol?.declarations?.some(
      declaration =>
        (ts.isVariableDeclaration(declaration) ||
          ts.isBindingElement(declaration) ||
          ts.isImportSpecifier(declaration) ||
          ts.isImportClause(declaration)) &&
        declaration.getSourceFile() === expression.getSourceFile(),
    );
    return localAlias === true ? semanticAuthorityConfigs : [];
  }
  if (ts.isElementAccessExpression(unwrapped)) return semanticAuthorityConfigs;
  if (
    ts.isPropertyAccessExpression(unwrapped) &&
    commonJsModuleReference(unwrapped.expression, checker, new Set()) !== undefined
  ) {
    return semanticAuthorityConfigs;
  }
  return [];
}

function semanticMemberNames(expression: ts.Expression, checker: ts.TypeChecker): readonly string[] {
  const unwrapped = unwrapExpression(expression);
  if (!ts.isPropertyAccessExpression(unwrapped) && !ts.isElementAccessExpression(unwrapped)) return [];
  const name = resolvedMemberName(unwrapped, checker);
  return [...semanticMemberNames(unwrapped.expression, checker), ...(name === undefined ? [] : [name])];
}

function contextualSemanticAuthorityName(
  config: SemanticAuthorityConfig,
  expression: ts.CallExpression,
  sourcePath: string,
  checker: ts.TypeChecker,
  program: ts.Program,
): SemanticAuthorityName {
  if (config.name !== 'AngularTemplateParser.parse') return config.name;
  const reflected = reflectedApplyInvocation(expression, checker, program, new Set());
  const members = semanticMemberNames(reflected?.target ?? expression.expression, checker);
  const normalizedSourcePath = sourcePath.replaceAll('\\', '/');
  if (normalizedSourcePath.endsWith('/migrator/analyzed-file.migrator.ts') && members.includes('validationParser')) {
    return 'ChangedTemplateValidation.parse';
  }
  if (normalizedSourcePath.endsWith('/migrator/migrator.ts') && members.includes('referenceParser')) {
    return 'CssReferenceParser.parse';
  }
  if (normalizedSourcePath.endsWith('/pipeline/analyze/analyze-project.stage.ts') && members.includes('parser')) {
    return 'OriginalTemplateParser.parse';
  }
  if (normalizedSourcePath.endsWith('/transaction/migration-transaction.ts') && members.includes('parser')) {
    return 'StagedTemplateValidation.parse';
  }
  return config.name;
}

function semanticFilesystemOperationInvocation(
  expression: ts.CallExpression,
  checker: ts.TypeChecker,
  program: ts.Program,
): SemanticFilesystemOperation | undefined {
  const resolveOperation = (target: ts.Expression): SemanticFilesystemOperation | undefined => {
    const provenance = filesystemProvenance(target, checker, new Set(), semanticFilesystemOperations, program);
    return provenance !== undefined && provenance !== '*' && semanticFilesystemOperations.has(provenance)
      ? (provenance as SemanticFilesystemOperation)
      : undefined;
  };
  const reflected = reflectedApplyInvocation(expression, checker, program, new Set());
  const invocation =
    reflected === undefined
      ? resolvedCallableInvocation(expression, checker, resolveOperation)
      : resolvedCallableApplication(reflected.target, reflected.arguments, checker, resolveOperation);
  return invocation?.provenance;
}

function semanticFilesystemOperationConstruction(
  expression: ts.NewExpression,
  checker: ts.TypeChecker,
  program: ts.Program,
): SemanticFilesystemOperation | undefined {
  const provenance = filesystemProvenance(
    expression.expression,
    checker,
    new Set(),
    semanticFilesystemOperations,
    program,
  );
  return provenance !== undefined && provenance !== '*' && semanticFilesystemOperations.has(provenance)
    ? (provenance as SemanticFilesystemOperation)
    : undefined;
}

function ignoreLibrarySymbolProvenance(
  symbol: ts.Symbol | undefined,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  if (symbol === undefined || seenSymbols.has(symbol)) return false;
  const nextSeen = new Set(seenSymbols).add(symbol);
  if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    const aliased = checker.getAliasedSymbol(symbol);
    if (aliased !== symbol && ignoreLibrarySymbolProvenance(aliased, checker, nextSeen)) return true;
  }
  return (symbol.declarations ?? []).some(declaration => {
    const reference = enclosingModuleReference(declaration);
    if (
      reference === 'ignore' &&
      (ts.isImportClause(declaration) ||
        (ts.isImportSpecifier(declaration) && (declaration.propertyName?.text ?? declaration.name.text) === 'default'))
    ) {
      return true;
    }
    if (
      (ts.isVariableDeclaration(declaration) ||
        ts.isPropertyAssignment(declaration) ||
        ts.isPropertyDeclaration(declaration)) &&
      declaration.initializer !== undefined
    ) {
      return ignoreLibraryCallableProvenance(declaration.initializer, checker, nextSeen);
    }
    if (ts.isShorthandPropertyAssignment(declaration)) {
      return ignoreLibrarySymbolProvenance(checker.getShorthandAssignmentValueSymbol(declaration), checker, nextSeen);
    }
    if (ts.isBindingElement(declaration)) {
      const pattern = declaration.parent;
      const variable =
        ts.isObjectBindingPattern(pattern) || ts.isArrayBindingPattern(pattern) ? pattern.parent : undefined;
      if (variable === undefined || !ts.isVariableDeclaration(variable) || variable.initializer === undefined) {
        return false;
      }
      const propertyName = bindingElementPropertyName(declaration);
      const moduleReference = commonJsModuleReference(variable.initializer, checker, nextSeen);
      return moduleReference?.reference === 'ignore' && (propertyName === 'default' || propertyName === undefined);
    }
    return false;
  });
}

function ignoreLibraryCallableProvenance(
  expression: ts.Expression,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): boolean {
  const unwrapped = unwrapExpression(expression);
  if (ts.isCallExpression(unwrapped)) {
    const reference = calledModule(unwrapped);
    if (reference === 'ignore') return true;
    const target = unwrapExpression(unwrapped.expression);
    if (
      (ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)) &&
      resolvedMemberName(target, checker) === 'bind'
    ) {
      return ignoreLibraryCallableProvenance(target.expression, checker, seenSymbols);
    }
    return false;
  }
  if (ts.isPropertyAccessExpression(unwrapped) || ts.isElementAccessExpression(unwrapped)) {
    const name = resolvedMemberName(unwrapped, checker);
    const moduleReference = commonJsModuleReference(unwrapped.expression, checker, seenSymbols);
    if (moduleReference?.reference === 'ignore' && (name === 'default' || name === undefined)) return true;
    const propertyNode = ts.isPropertyAccessExpression(unwrapped) ? unwrapped.name : unwrapped.argumentExpression;
    if (
      propertyNode !== undefined &&
      ignoreLibrarySymbolProvenance(checker.getSymbolAtLocation(propertyNode), checker, seenSymbols)
    ) {
      return true;
    }
  }
  return ignoreLibrarySymbolProvenance(checker.getSymbolAtLocation(unwrapped), checker, seenSymbols);
}

function ignoreLibraryInvocation(expression: ts.CallExpression, checker: ts.TypeChecker, program: ts.Program): boolean {
  const reflected = reflectedApplyInvocation(expression, checker, program, new Set());
  const resolveIgnore = (target: ts.Expression): true | undefined =>
    ignoreLibraryCallableProvenance(target, checker) ? true : undefined;
  return (
    (reflected === undefined
      ? resolvedCallableInvocation(expression, checker, resolveIgnore)
      : resolvedCallableApplication(reflected.target, reflected.arguments, checker, resolveIgnore)) !== undefined
  );
}

function runtimeAcquisitionReference(node: ts.Node): string | undefined {
  if (ts.isImportDeclaration(node)) {
    return runtimeImportReference(node);
  }
  if (ts.isExportDeclaration(node)) {
    return runtimeExportReference(node);
  }
  if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
    return moduleText(node.moduleReference.expression);
  }
  return ts.isCallExpression(node) ? calledModule(node) : undefined;
}

function ignoreLibraryAcquisition(node: ts.Node): boolean {
  return runtimeAcquisitionReference(node) === 'ignore';
}

function runtimeImportedBindingReferences(sourceFile: ts.SourceFile): ReadonlyMap<string, string> {
  const references = new Map<string, string>();
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      for (const binding of runtimeImportBindings(statement)) {
        references.set(binding.localName, binding.moduleReference);
      }
      continue;
    }
    if (
      ts.isImportEqualsDeclaration(statement) &&
      !statement.isTypeOnly &&
      ts.isExternalModuleReference(statement.moduleReference)
    ) {
      const reference = moduleText(statement.moduleReference.expression);
      if (reference !== undefined) references.set(statement.name.text, reference);
    }
  }
  return references;
}

interface RuntimeImportedBindingTarget {
  readonly forwardExportedName?: boolean;
  readonly importedName: string;
  readonly reference: string;
}

function runtimeImportedBindingTargets(sourceFile: ts.SourceFile): ReadonlyMap<string, RuntimeImportedBindingTarget> {
  const targets = new Map<string, RuntimeImportedBindingTarget>();
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      for (const binding of runtimeImportBindings(statement)) {
        targets.set(binding.localName, {
          importedName: binding.importedName,
          reference: binding.moduleReference,
        });
      }
      continue;
    }
    if (
      ts.isImportEqualsDeclaration(statement) &&
      !statement.isTypeOnly &&
      ts.isExternalModuleReference(statement.moduleReference)
    ) {
      const reference = moduleText(statement.moduleReference.expression);
      if (reference !== undefined) targets.set(statement.name.text, { importedName: '*', reference });
    }
  }
  return targets;
}

function runtimeExportedBindingTargets(
  sourceFile: ts.SourceFile,
  exportedName: string,
): readonly RuntimeImportedBindingTarget[] {
  const imports = runtimeImportedBindingTargets(sourceFile);
  const targets: RuntimeImportedBindingTarget[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      const expression = unwrapExpression(statement.expression);
      if (ts.isIdentifier(expression)) {
        const imported = imports.get(expression.text);
        if (imported !== undefined) {
          targets.push({
            forwardExportedName: imported.importedName === '*',
            importedName: imported.importedName,
            reference: imported.reference,
          });
        }
      } else if (ts.isCallExpression(expression)) {
        const reference = calledModule(expression);
        if (reference !== undefined) targets.push({ forwardExportedName: true, importedName: exportedName, reference });
      }
      continue;
    }
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
    const reference = runtimeExportReference(statement);
    if (reference !== undefined) {
      if (statement.exportClause === undefined) {
        targets.push({ forwardExportedName: true, importedName: exportedName, reference });
      } else if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          if (element.isTypeOnly || element.name.text !== exportedName) continue;
          targets.push({ importedName: element.propertyName?.text ?? element.name.text, reference });
        }
      } else if (statement.exportClause.name.text === exportedName) {
        targets.push({ forwardExportedName: false, importedName: '*', reference });
      }
      continue;
    }
    if (
      statement.moduleSpecifier !== undefined ||
      statement.exportClause === undefined ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue;
    }
    for (const element of statement.exportClause.elements) {
      if (element.isTypeOnly || element.name.text !== exportedName) continue;
      const localName = element.propertyName?.text ?? element.name.text;
      const imported = imports.get(localName);
      if (imported !== undefined) {
        targets.push({
          ...imported,
          forwardExportedName: false,
        });
      }
    }
  }

  return targets;
}

function runtimeReExportReferences(sourceFile: ts.SourceFile): readonly string[] {
  const importedBindings = runtimeImportedBindingReferences(sourceFile);
  const references: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isExportAssignment(node)) {
      const expression = unwrapExpression(node.expression);
      if (ts.isIdentifier(expression)) {
        const importedReference = importedBindings.get(expression.text);
        if (importedReference !== undefined) references.push(importedReference);
      } else if (ts.isCallExpression(expression)) {
        const reference = calledModule(expression);
        if (reference !== undefined) references.push(reference);
      }
      return;
    }
    if (ts.isExportDeclaration(node)) {
      const reference = runtimeExportReference(node);
      if (reference !== undefined) {
        references.push(reference);
        return;
      }
      if (
        !node.isTypeOnly &&
        node.moduleSpecifier === undefined &&
        node.exportClause !== undefined &&
        ts.isNamedExports(node.exportClause)
      ) {
        for (const element of node.exportClause.elements) {
          if (element.isTypeOnly) continue;
          const localName = element.propertyName?.text ?? element.name.text;
          const importedReference = importedBindings.get(localName);
          if (importedReference !== undefined) references.push(importedReference);
        }
      }
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return references;
}

function runtimeAcquisitionReaches(
  reference: string,
  containingSourcePath: string,
  matchesReference: (reference: string) => boolean,
  matchesLocalPath: (path: string) => boolean,
  program: ts.Program,
  seenPaths: ReadonlySet<string> = new Set(),
): boolean {
  if (matchesReference(reference)) return true;
  for (const candidate of localModuleCandidates(reference, containingSourcePath)) {
    const normalizedCandidate = resolve(candidate);
    if (matchesLocalPath(normalizedCandidate.replaceAll('\\', '/'))) return true;
    if (seenPaths.has(normalizedCandidate)) continue;
    const sourceFile = program.getSourceFile(normalizedCandidate);
    if (sourceFile === undefined) continue;
    const nextSeen = new Set(seenPaths).add(normalizedCandidate);
    if (
      runtimeReExportReferences(sourceFile).some(dependencyReference =>
        runtimeAcquisitionReaches(
          dependencyReference,
          normalizedCandidate,
          matchesReference,
          matchesLocalPath,
          program,
          nextSeen,
        ),
      )
    ) {
      return true;
    }
  }
  return false;
}

function uniqueFilesystemProvenances(provenances: readonly FilesystemProvenance[]): readonly FilesystemProvenance[] {
  return [...new Set(provenances)];
}

function filesystemModuleMemberProvenances(
  reference: string,
  containingSourcePath: string,
  memberPath: readonly string[],
  operationNames: ReadonlySet<string>,
  program: ts.Program,
  seenExports: ReadonlySet<string> = new Set(),
): readonly FilesystemProvenance[] {
  if (isFilesystemModuleReference(reference)) {
    let provenances: readonly FilesystemProvenance[] = ['*'];
    for (const propertyName of memberPath) {
      provenances = uniqueFilesystemProvenances(
        provenances.flatMap(provenance => {
          const member = filesystemNamespaceMemberProvenance(provenance, propertyName, operationNames);
          return member === undefined ? [] : [member];
        }),
      );
    }
    return provenances;
  }

  const provenances: FilesystemProvenance[] = [];
  for (const candidate of localModuleCandidates(reference, containingSourcePath)) {
    const sourcePath = resolve(candidate);
    const key = `${sourcePath}\0${memberPath.length === 0 ? '<namespace>' : memberPath.join('\0')}`;
    if (seenExports.has(key)) continue;
    const sourceFile = program.getSourceFile(sourcePath);
    if (sourceFile === undefined) continue;
    const nextSeen = new Set(seenExports).add(key);

    const [exportedName, ...remainingMembers] = memberPath;
    if (exportedName === undefined) {
      for (const runtimeExportedName of runtimeExportedNames(sourceFile)) {
        if (runtimeExportedName === '*') continue;
        provenances.push(
          ...filesystemModuleMemberProvenances(
            reference,
            containingSourcePath,
            [runtimeExportedName],
            operationNames,
            program,
            nextSeen,
          ),
        );
      }
      for (const target of runtimeExportedBindingTargets(sourceFile, '*')) {
        provenances.push(
          ...filesystemModuleMemberProvenances(
            target.reference,
            sourcePath,
            target.importedName === '*' ? [] : [target.importedName],
            operationNames,
            program,
            nextSeen,
          ),
        );
      }
      continue;
    }

    for (const target of runtimeExportedBindingTargets(sourceFile, exportedName)) {
      const targetPath =
        target.importedName === '*'
          ? target.forwardExportedName === true
            ? memberPath
            : remainingMembers
          : [target.importedName, ...remainingMembers];
      provenances.push(
        ...filesystemModuleMemberProvenances(
          target.reference,
          sourcePath,
          targetPath,
          operationNames,
          program,
          nextSeen,
        ),
      );
    }
  }

  return uniqueFilesystemProvenances(provenances);
}

function filesystemModuleNamespaceProvenances(
  reference: string,
  containingSourcePath: string,
  operationNames: ReadonlySet<string>,
  program: ts.Program,
  seenExports: ReadonlySet<string> = new Set(),
): readonly FilesystemProvenance[] {
  return filesystemModuleMemberProvenances(reference, containingSourcePath, [], operationNames, program, seenExports);
}

function filesystemModuleExportProvenances(
  reference: string,
  containingSourcePath: string,
  exportedName: string,
  operationNames: ReadonlySet<string>,
  program: ts.Program,
  seenExports: ReadonlySet<string> = new Set(),
): readonly FilesystemProvenance[] {
  return filesystemModuleMemberProvenances(
    reference,
    containingSourcePath,
    [exportedName],
    operationNames,
    program,
    seenExports,
  );
}

function filesystemModuleExportProvenance(
  reference: string,
  containingSourcePath: string,
  exportedName: string,
  operationNames: ReadonlySet<string>,
  program: ts.Program,
  seenExports: ReadonlySet<string> = new Set(),
): FilesystemProvenance | undefined {
  return filesystemModuleExportProvenances(
    reference,
    containingSourcePath,
    exportedName,
    operationNames,
    program,
    seenExports,
  )[0];
}

function semanticFilesystemAcquisition(
  provenance: FilesystemProvenance | undefined,
): SemanticFilesystemAcquisition | undefined {
  return provenance === '*' || (provenance !== undefined && semanticFilesystemOperations.has(provenance))
    ? (provenance as SemanticFilesystemAcquisition)
    : undefined;
}

function semanticFilesystemAcquisitions(
  provenances: readonly FilesystemProvenance[],
): readonly SemanticFilesystemAcquisition[] {
  return provenances.flatMap(provenance => {
    const acquisition = semanticFilesystemAcquisition(provenance);
    return acquisition === undefined ? [] : [acquisition];
  });
}

function runtimeExportedNames(sourceFile: ts.SourceFile): readonly string[] {
  const names: string[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      names.push('*');
      continue;
    }
    if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) continue;
    if (statement.exportClause === undefined) {
      names.push('*');
      continue;
    }
    if (ts.isNamespaceExport(statement.exportClause)) {
      names.push(statement.exportClause.name.text);
      continue;
    }
    for (const element of statement.exportClause.elements) {
      if (!element.isTypeOnly) names.push(element.name.text);
    }
  }
  return names;
}

function filesystemNamespaceAcquisitions(
  reference: string,
  containingSourcePath: string,
  program: ts.Program,
): readonly SemanticFilesystemAcquisition[] {
  return filesystemModuleNamespaceProvenances(
    reference,
    containingSourcePath,
    semanticFilesystemOperations,
    program,
  ).flatMap(provenance => {
    const acquisition = semanticFilesystemAcquisition(provenance);
    return acquisition === undefined ? [] : [acquisition];
  });
}

function filesystemImportedBindingAcquisition(
  reference: string,
  containingSourcePath: string,
  importedName: string,
  program: ts.Program,
): readonly SemanticFilesystemAcquisition[] {
  if (importedName === '*') return filesystemNamespaceAcquisitions(reference, containingSourcePath, program);
  return filesystemModuleExportProvenances(
    reference,
    containingSourcePath,
    importedName,
    semanticFilesystemOperations,
    program,
  ).flatMap(provenance => {
    const acquisition = semanticFilesystemAcquisition(provenance);
    return acquisition === undefined ? [] : [acquisition];
  });
}

function bindingIdentifiers(name: ts.BindingName): readonly ts.Identifier[] {
  if (ts.isIdentifier(name)) return [name];
  return name.elements.flatMap(element => (ts.isOmittedExpression(element) ? [] : bindingIdentifiers(element.name)));
}

function acquiredFilesystemExpression(expression: ts.Expression): ts.Expression {
  let current: ts.Expression = expression;
  while (true) {
    const parent = current.parent;
    if (
      ((ts.isAwaitExpression(parent) ||
        ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isTypeAssertionExpression(parent) ||
        ts.isNonNullExpression(parent) ||
        ts.isSatisfiesExpression(parent)) &&
        parent.expression === current) ||
      ((ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === current)
    ) {
      current = parent;
      continue;
    }
    return current;
  }
}

function acquisitionVariableDeclaration(expression: ts.CallExpression): ts.VariableDeclaration | undefined {
  const acquiredExpression = acquiredFilesystemExpression(expression);
  const parent = acquiredExpression.parent;
  return ts.isVariableDeclaration(parent) && parent.initializer === acquiredExpression ? parent : undefined;
}

function filesystemCallAcquisitions(
  node: ts.CallExpression,
  reference: string,
  checker: ts.TypeChecker,
  program: ts.Program,
): readonly SemanticFilesystemAcquisition[] {
  const variable = acquisitionVariableDeclaration(node);
  if (variable !== undefined) {
    if (ts.isIdentifier(variable.name)) {
      const provenances = filesystemProvenances(
        variable.name,
        checker,
        new Set(),
        semanticFilesystemOperations,
        program,
      );
      return provenances.includes('*')
        ? filesystemNamespaceAcquisitions(reference, node.getSourceFile().fileName, program)
        : semanticFilesystemAcquisitions(provenances);
    }
    return bindingIdentifiers(variable.name).flatMap(identifier => {
      const provenances = filesystemProvenances(identifier, checker, new Set(), semanticFilesystemOperations, program);
      return provenances.includes('*')
        ? filesystemNamespaceAcquisitions(reference, node.getSourceFile().fileName, program)
        : semanticFilesystemAcquisitions(provenances);
    });
  }

  const acquiredExpression = acquiredFilesystemExpression(node);
  const provenances = filesystemProvenances(
    acquiredExpression,
    checker,
    new Set(),
    semanticFilesystemOperations,
    program,
  );
  return provenances.length === 0 || provenances.includes('*')
    ? filesystemNamespaceAcquisitions(reference, node.getSourceFile().fileName, program)
    : semanticFilesystemAcquisitions(provenances);
}

function filesystemAcquisitions(
  node: ts.Node,
  checker: ts.TypeChecker,
  program: ts.Program,
): readonly SemanticFilesystemAcquisition[] {
  if (ts.isImportDeclaration(node)) {
    const reference = runtimeImportReference(node);
    if (reference === undefined) return [];
    const bindings = runtimeImportBindings(node);
    return bindings.length === 0
      ? filesystemNamespaceAcquisitions(reference, node.getSourceFile().fileName, program)
      : bindings.flatMap(binding =>
          filesystemImportedBindingAcquisition(
            binding.moduleReference,
            node.getSourceFile().fileName,
            binding.importedName,
            program,
          ),
        );
  }

  if (ts.isExportDeclaration(node)) {
    const reference = runtimeExportReference(node);
    if (reference === undefined) return [];
    if (node.exportClause === undefined || ts.isNamespaceExport(node.exportClause)) {
      return filesystemNamespaceAcquisitions(reference, node.getSourceFile().fileName, program);
    }
    return node.exportClause.elements.flatMap(element =>
      element.isTypeOnly
        ? []
        : filesystemImportedBindingAcquisition(
            reference,
            node.getSourceFile().fileName,
            element.propertyName?.text ?? element.name.text,
            program,
          ),
    );
  }

  if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly && ts.isExternalModuleReference(node.moduleReference)) {
    const reference = moduleText(node.moduleReference.expression);
    return reference === undefined
      ? []
      : filesystemNamespaceAcquisitions(reference, node.getSourceFile().fileName, program);
  }

  if (ts.isCallExpression(node)) {
    const reference = calledModule(node);
    if (
      reference === undefined ||
      !runtimeAcquisitionReaches(
        reference,
        node.getSourceFile().fileName,
        isFilesystemModuleReference,
        () => false,
        program,
      )
    ) {
      return [];
    }
    return filesystemCallAcquisitions(node, reference, checker, program);
  }

  return [];
}

function gitIgnoreHelperAcquisition(node: ts.Node, program: ts.Program): boolean {
  const reference = runtimeAcquisitionReference(node);
  return (
    reference !== undefined &&
    runtimeAcquisitionReaches(
      reference,
      node.getSourceFile().fileName,
      () => false,
      path => path.endsWith('/lib/gitignore.helper.ts'),
      program,
    )
  );
}

function declarationCallableBody(declaration: ts.Declaration): ts.ConciseBody | undefined {
  if (
    ts.isArrowFunction(declaration) ||
    ts.isFunctionDeclaration(declaration) ||
    ts.isFunctionExpression(declaration) ||
    ts.isMethodDeclaration(declaration)
  ) {
    return declaration.body;
  }
  return undefined;
}

function shouldTraceCallableBody(declaration: ts.Declaration, program: ts.Program): boolean {
  // Root files are visited directly. Only follow bodies across a dependency edge,
  // which keeps whole-project inspections linear while still attributing imported helpers to their caller.
  return inspectionRootPaths.get(program)?.has(resolve(declaration.getSourceFile().fileName)) !== true;
}

function callableBodyContainsTransactionApplication(
  body: ts.ConciseBody,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (found) return;
    if (ts.isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
    if (ts.isCallExpression(node) && transactionApplicationInvocation(node, checker, program, seenSymbols)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  return found;
}

function callableBodyContainsMigrationWrite(
  body: ts.ConciseBody,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (found) return;
    if (ts.isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
    if (ts.isCallExpression(node) && migrationWriteInvocation(node, checker, program, seenSymbols)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  return found;
}

function callableBodyContainsCurrentPipelineWrite(
  body: ts.ConciseBody,
  checker: ts.TypeChecker,
  program: ts.Program,
  seenSymbols: ReadonlySet<ts.Symbol>,
): boolean {
  let found = false;
  function visit(node: ts.Node): void {
    if (found) return;
    if (ts.isFunctionLike(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) return;
    if (ts.isCallExpression(node) && currentPipelineWriteInvocation(node, checker, program, seenSymbols)) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  }
  visit(body);
  return found;
}

/** Semantically inspects mutation authority and boundary inputs across local module edges. */
export function inspectTypeScriptProject(
  sourcePaths: readonly string[],
  sourceOverrides: ReadonlyMap<string, string> = new Map(),
): TypeScriptProjectInspection {
  const { checker, program, rootPaths } = createProjectProgram(sourcePaths, sourceOverrides);
  inspectionRootPaths.set(program, rootPaths);
  const filesystemMutationCalls: { sourcePath: string; name: string }[] = [];
  const adapterPathInputs: { sourcePath: string; name: string }[] = [];
  const executionModeInputs: { sourcePath: string; name: string }[] = [];
  const transactionApplyCalls: { sourcePath: string; name: 'apply' }[] = [];
  const projectWriteAuthorityCalls: {
    sourcePath: string;
    name: 'apply' | 'migrate' | 'run';
  }[] = [];
  const seenAdapterPaths = new Set<string>();
  const seenExecutionModeInputs = new Set<string>();

  for (const sourceFile of program.getSourceFiles()) {
    const sourcePath = resolve(sourceFile.fileName);
    if (!rootPaths.has(sourcePath)) continue;
    function visit(node: ts.Node): void {
      if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
        const provenance = filesystemProvenance(node.expression, checker);
        if (provenance !== undefined && provenance !== '*' && filesystemMutationNames.has(provenance)) {
          filesystemMutationCalls.push({ sourcePath, name: provenance });
        }
      }
      if (ts.isCallExpression(node)) {
        if (transactionApplicationInvocation(node, checker, program)) {
          transactionApplyCalls.push({ sourcePath, name: 'apply' });
          projectWriteAuthorityCalls.push({ sourcePath, name: 'apply' });
        }
        if (migrationWriteInvocation(node, checker, program)) {
          projectWriteAuthorityCalls.push({ sourcePath, name: 'migrate' });
        }
        if (currentPipelineWriteInvocation(node, checker, program)) {
          projectWriteAuthorityCalls.push({ sourcePath, name: 'run' });
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
          for (const name of executionModeInputsInParameter(parameter, checker)) {
            const key = `${sourcePath}\0${name}`;
            if (seenExecutionModeInputs.has(key)) continue;
            seenExecutionModeInputs.add(key);
            executionModeInputs.push({ sourcePath, name });
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }

  return {
    filesystemMutationCalls,
    adapterPathInputs,
    executionModeInputs,
    transactionApplyCalls,
    projectWriteAuthorityCalls,
  };
}

/** Resolves named pipeline and stage-boundary calls through semantic callable provenance. */
export function inspectSemanticAuthorityCalls(
  sourcePaths: readonly string[],
  sourceOverrides: ReadonlyMap<string, string> = new Map(),
): readonly SemanticAuthorityCall[] {
  const { checker, program, rootPaths } = createProjectProgram(sourcePaths, sourceOverrides);
  inspectionRootPaths.set(program, rootPaths);
  const calls: SemanticAuthorityCall[] = [];

  for (const sourceFile of program.getSourceFiles()) {
    const sourcePath = resolve(sourceFile.fileName);
    if (!rootPaths.has(sourcePath)) continue;
    function visit(node: ts.Node): void {
      if (gitIgnoreHelperAcquisition(node, program)) {
        calls.push({ sourcePath, name: 'GitIgnoreHelper.acquire' });
      }
      if (ignoreLibraryAcquisition(node)) {
        calls.push({ sourcePath, name: 'IgnoreLibrary.acquire' });
      }
      for (const acquisition of filesystemAcquisitions(node, checker, program)) {
        calls.push({ sourcePath, name: `FileSystem.acquire.${acquisition}` });
      }
      if (ts.isCallExpression(node)) {
        const filesystemOperation = semanticFilesystemOperationInvocation(node, checker, program);
        if (filesystemOperation !== undefined) {
          calls.push({ sourcePath, name: `FileSystem.${filesystemOperation}` });
        }
        if (ignoreLibraryInvocation(node, checker, program)) {
          calls.push({ sourcePath, name: 'IgnoreLibrary.createMatcher' });
        }
        if (transactionApplicationInvocation(node, checker, program)) {
          calls.push({ sourcePath, name: 'MigrationTransaction.apply' });
        }
        for (const config of semanticAuthorityCandidates(node, checker, program)) {
          if (config.name === 'MigrationTransaction.apply') continue;
          if (semanticAuthorityInvocation(node, config, checker, program)) {
            calls.push({
              sourcePath,
              name: contextualSemanticAuthorityName(config, node, sourcePath, checker, program),
            });
          }
        }
      }
      if (ts.isNewExpression(node)) {
        const filesystemOperation = semanticFilesystemOperationConstruction(node, checker, program);
        if (filesystemOperation !== undefined) {
          calls.push({ sourcePath, name: `FileSystem.${filesystemOperation}` });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }

  return calls;
}

/** Resolves the transitive local runtime dependency closure for every requested source root. */
export function inspectRuntimeDependencyClosure(
  sourcePaths: readonly string[],
  sourceOverrides: ReadonlyMap<string, string> = new Map(),
): readonly RuntimeDependencyFinding[] {
  const { program } = createProjectProgram(sourcePaths, sourceOverrides);
  const normalizedOverrides = new Map(
    [...sourceOverrides].map(([sourcePath, source]) => [resolve(sourcePath), source] as const),
  );
  const findings: RuntimeDependencyFinding[] = [];
  const seenFindings = new Set<string>();

  function sourceText(sourcePath: string): string | undefined {
    return (
      normalizedOverrides.get(sourcePath) ?? program.getSourceFile(sourcePath)?.text ?? ts.sys.readFile(sourcePath)
    );
  }

  function resolvedLocalDependency(reference: string, containingSourcePath: string): string | undefined {
    if (!reference.startsWith('.')) return undefined;
    return localModuleCandidates(reference, containingSourcePath).find(
      candidate =>
        normalizedOverrides.has(candidate) ||
        program.getSourceFile(candidate) !== undefined ||
        ts.sys.fileExists(candidate),
    );
  }

  for (const requestedSourcePath of sourcePaths) {
    const sourcePath = resolve(requestedSourcePath);
    const visited = new Set<string>();
    function visit(currentSourcePath: string): void {
      if (visited.has(currentSourcePath)) return;
      visited.add(currentSourcePath);
      const source = sourceText(currentSourcePath);
      if (source === undefined) return;
      for (const reference of runtimeModuleReferences(source, currentSourcePath)) {
        const dependencyPath = resolvedLocalDependency(reference, currentSourcePath);
        if (dependencyPath === undefined) continue;
        const key = `${sourcePath}\0${dependencyPath}`;
        if (!seenFindings.has(key)) {
          seenFindings.add(key);
          findings.push({ sourcePath, dependencyPath });
        }
        visit(dependencyPath);
      }
    }
    visit(sourcePath);
  }

  return findings;
}

function canonicalRuntimeSymbol(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): ts.Symbol {
  if ((symbol.flags & ts.SymbolFlags.Alias) === 0 || seenSymbols.has(symbol)) return symbol;
  const aliased = checker.getAliasedSymbol(symbol);
  return aliased === symbol ? symbol : canonicalRuntimeSymbol(aliased, checker, new Set(seenSymbols).add(symbol));
}

function runtimeSymbolsForBinding(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  seenSymbols: ReadonlySet<ts.Symbol> = new Set(),
): readonly ts.Symbol[] {
  const canonical = canonicalRuntimeSymbol(symbol, checker, seenSymbols);
  if (seenSymbols.has(canonical)) return [];
  const nextSeen = new Set(seenSymbols).add(canonical);
  if ((canonical.flags & (ts.SymbolFlags.ValueModule | ts.SymbolFlags.NamespaceModule)) === 0) return [canonical];
  const exports = checker.getExportsOfModule(canonical);
  if (exports.length === 0) return [canonical];
  return exports.flatMap(exported => runtimeSymbolsForBinding(exported, checker, nextSeen));
}

/** Resolves runtime import and re-export bindings through aliases, barrels, and namespace imports. */
export function inspectRuntimeSymbolProvenance(
  sourcePaths: readonly string[],
  sourceOverrides: ReadonlyMap<string, string> = new Map(),
): readonly RuntimeSymbolProvenance[] {
  const { checker, program, rootPaths } = createProjectProgram(sourcePaths, sourceOverrides);
  const findings: RuntimeSymbolProvenance[] = [];
  const seenFindings = new Set<string>();

  function record(sourcePath: string, symbol: ts.Symbol | undefined): void {
    if (symbol === undefined) return;
    for (const resolved of runtimeSymbolsForBinding(symbol, checker)) {
      const declaration = resolved.valueDeclaration ?? resolved.declarations?.[0];
      if (declaration === undefined) continue;
      const finding = {
        sourcePath,
        symbolName: resolved.getName(),
        declarationPath: resolve(declaration.getSourceFile().fileName),
      };
      const key = `${finding.sourcePath}\0${finding.symbolName}\0${finding.declarationPath}`;
      if (seenFindings.has(key)) continue;
      seenFindings.add(key);
      findings.push(finding);
    }
  }

  function recordModuleExports(sourcePath: string, moduleSpecifier: ts.Expression): void {
    record(sourcePath, checker.getSymbolAtLocation(moduleSpecifier));
  }

  for (const sourceFile of program.getSourceFiles()) {
    const sourcePath = resolve(sourceFile.fileName);
    if (!rootPaths.has(sourcePath)) continue;

    function visit(node: ts.Node): void {
      if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (clause === undefined || clause.isTypeOnly) {
          ts.forEachChild(node, visit);
          return;
        }
        if (clause.name !== undefined) record(sourcePath, checker.getSymbolAtLocation(clause.name));
        if (clause.namedBindings !== undefined) {
          if (ts.isNamespaceImport(clause.namedBindings)) {
            record(sourcePath, checker.getSymbolAtLocation(clause.namedBindings.name));
          } else {
            for (const binding of clause.namedBindings.elements) {
              if (!binding.isTypeOnly) record(sourcePath, checker.getSymbolAtLocation(binding.name));
            }
          }
        }
      } else if (ts.isExportDeclaration(node) && !node.isTypeOnly) {
        const exportClause = node.exportClause;
        if (exportClause === undefined && node.moduleSpecifier !== undefined) {
          recordModuleExports(sourcePath, node.moduleSpecifier);
        } else if (exportClause !== undefined && ts.isNamedExports(exportClause)) {
          for (const binding of exportClause.elements) {
            if (!binding.isTypeOnly) record(sourcePath, checker.getSymbolAtLocation(binding.name));
          }
        }
      } else if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) {
        record(sourcePath, checker.getSymbolAtLocation(node.name));
      }
      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  return findings;
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
