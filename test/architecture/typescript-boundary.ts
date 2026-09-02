import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

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
  readonly objectPropertyTables: readonly (readonly string[])[];
  readonly callExpressionNames: readonly string[];
  readonly constructedExpressionNames: readonly string[];
  readonly parameters: readonly InspectedParameter[];
  readonly declaredPropertyNames: readonly string[];
  readonly runtimeImports: readonly InspectedRuntimeImport[];
  readonly exportedFunctions: readonly InspectedExportedFunction[];
}

function moduleText(expression: ts.Expression | undefined): string | undefined {
  return expression && ts.isStringLiteralLike(expression) ? expression.text : undefined;
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
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
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
  const sourceFile = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
  const moduleReferences: string[] = [];
  const identifiers: string[] = [];
  const literalTexts: string[] = [];
  const numericLiterals: number[] = [];
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
    }
    if (ts.isNumericLiteral(node)) numericLiterals.push(Number(node.text));
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
    objectPropertyTables,
    callExpressionNames,
    constructedExpressionNames,
    parameters,
    declaredPropertyNames,
    runtimeImports,
    exportedFunctions,
  };
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
