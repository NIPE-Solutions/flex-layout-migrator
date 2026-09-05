import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';
import { createServer } from 'vite';

const registryPaths = {
  cli: 'website/src/content/cli-reference.ts',
  diagnostics: 'website/src/content/diagnostic-reference.ts',
  compatibility: 'website/src/content/compatibility-reference.ts',
  report: 'website/src/content/report-reference.ts',
  examples: 'website/src/content/example-reference.ts',
};

export async function verifyDocumentationContract(root) {
  const projectRoot = path.resolve(root);
  await verifyCliOptions(projectRoot);
  const diagnosticCodes = await verifyDiagnostics(projectRoot);
  await verifyCompatibilityEvidence(projectRoot, diagnosticCodes);
  const production = await loadProductionOracle(projectRoot);
  try {
    await verifyReportExamples(projectRoot, production.MigrationReportBuilder, diagnosticCodes.conversion);
    await verifyTransformationExamples(projectRoot, production.previewTemplate, diagnosticCodes);
  } finally {
    await production.close();
  }
}

async function verifyCliOptions(root) {
  const [registry, source] = await Promise.all([
    readRegistry(root, registryPaths.cli, 'cliReference'),
    readFile(path.join(root, 'src/cli/run-cli.ts'), 'utf8'),
  ]);
  assertArray(registry, 'CLI option registry');
  assertUnique(registry, item => item.longFlag, 'CLI option');

  const definitions = parseCliDefinitions(source);
  assertUnique(definitions, item => item.longFlag, 'Commander option');
  assertExactSet(
    'CLI option registry',
    registry.map(item => item.longFlag),
    definitions.map(item => item.longFlag),
  );

  const documented = new Map(registry.map(item => [item.longFlag, cliContract(item)]));
  const implemented = new Map(definitions.map(item => [item.longFlag, cliContract(item)]));
  for (const [flag, definition] of implemented) {
    if (JSON.stringify(documented.get(flag)) !== JSON.stringify(definition)) {
      throw new Error(
        `CLI option registry metadata differs for ${flag}: documented ${JSON.stringify(documented.get(flag))}, implemented ${JSON.stringify(definition)}`,
      );
    }
  }
  await verifyCliEvidencePaths(root, registry);
}

async function verifyDiagnostics(root) {
  const [registry, source] = await Promise.all([
    readRegistry(root, registryPaths.diagnostics, 'diagnosticReference'),
    readFile(path.join(root, 'src/analyzer/conversion-result.ts'), 'utf8'),
  ]);
  assertArray(registry, 'diagnostic registry');
  assertUnique(registry, item => item.code, 'diagnostic');

  const sourceFile = parseTypeScript('src/analyzer/conversion-result.ts', source);
  const conversionCodes = stringLiterals(findTypeAlias(sourceFile, 'DiagnosticCode').type);
  const parseErrorCode = findInterfaceMember(findInterface(sourceFile, 'ParseErrorResult'), 'code');
  const parseCodes = stringLiterals(parseErrorCode.type);
  assertExactSet(
    'diagnostic registry',
    registry.map(item => item.code),
    [...conversionCodes, ...parseCodes],
  );

  for (const item of registry) {
    if (
      !isNonEmptyString(item.family) ||
      !isNonEmptyString(item.meaning) ||
      !isNonEmptyString(item.unsafeToGuess) ||
      !Array.isArray(item.resolution) ||
      item.resolution.length === 0 ||
      !item.resolution.every(isNonEmptyString) ||
      typeof item.rerunEligible !== 'boolean'
    ) {
      throw new Error(`diagnostic registry entry ${String(item.code)} is incomplete`);
    }
  }
  return {
    all: new Set(registry.map(item => item.code)),
    conversion: new Set(conversionCodes),
    parse: new Set(parseCodes),
  };
}

async function verifyCompatibilityEvidence(root, diagnosticCodes) {
  const [registry, examples, catalogSource, inventorySource, compatibilitySource] = await Promise.all([
    readRegistry(root, registryPaths.compatibility, 'compatibilityReference'),
    readRegistry(root, registryPaths.examples, 'verifiedExamples'),
    readFile(path.join(root, 'src/analyzer/flex-layout.catalog.ts'), 'utf8'),
    readFile(path.join(root, 'test/compatibility/compatibility-inventory.ts'), 'utf8'),
    readFile(path.join(root, 'docs/compatibility.md'), 'utf8'),
  ]);
  assertArray(registry, 'compatibility registry');
  assertArray(examples, 'transformation example registry');
  assertUnique(registry, item => item.id, 'compatibility entry');
  assertUnique(examples, item => item.id, 'transformation example');

  const catalogFile = parseTypeScript('src/analyzer/flex-layout.catalog.ts', catalogSource);
  const catalog = evaluateExport(catalogFile, 'FLEX_LAYOUT_DIRECTIVES');
  const inventoryFile = parseTypeScript('test/compatibility/compatibility-inventory.ts', inventorySource);
  const inventory = evaluateExport(inventoryFile, 'COMPATIBILITY_INVENTORY');
  const contract = parseCompatibilityTable(compatibilitySource);
  assertUnique(contract, item => item.id, 'compatibility contract entry');
  assertUnique(inventory, item => item.directive, 'structured compatibility inventory entry');
  assertExactSet(
    'compatibility registry',
    registry.map(item => item.id),
    catalog,
  );
  assertExactSet(
    'compatibility contract',
    contract.map(item => item.id),
    catalog,
  );
  assertExactSet(
    'compatibility inventory',
    inventory.map(item => item.directive),
    catalog,
  );

  const documented = new Map(registry.map(item => [item.id, compatibilityContract(item)]));
  const evidenceEntries = [
    ...contract,
    ...inventory.map(item => ({
      id: item.directive,
      directiveFamily: compatibilityFamily(item.family),
      category: compatibilityInventoryCategory(item.family),
      tailwind: item.tailwind,
      css: item.css,
    })),
  ];
  for (const entry of evidenceEntries) {
    const actual = documented.get(entry.id);
    if (JSON.stringify(actual) !== JSON.stringify(compatibilityContract(entry))) {
      throw new Error(
        `compatibility registry differs for ${entry.id}: documented ${JSON.stringify(actual)}, contract ${JSON.stringify(compatibilityContract(entry))}`,
      );
    }
  }
  const examplesById = new Map(examples.map(example => [example.id, example]));
  for (const example of examples) {
    if (!Array.isArray(example.directiveIds) || example.directiveIds.length === 0) {
      throw new Error(`transformation example ${String(example.id)} has no directive IDs`);
    }
    assertUnique(example.directiveIds, value => value, `transformation example ${String(example.id)} directive`);
    for (const directiveId of example.directiveIds) {
      if (!catalog.includes(directiveId)) {
        throw new Error(`transformation example ${String(example.id)} uses unknown directive ${String(directiveId)}`);
      }
    }
  }
  for (const entry of registry) {
    for (const target of ['tailwind', 'css']) {
      const detail = entry.targetDetails?.[target];
      if (detail?.status !== entry[target]) {
        throw new Error(`compatibility ${entry.id} ${target} detail status differs from registry status`);
      }
      for (const field of ['supportedForms', 'limitedForms']) {
        if (!Array.isArray(detail[field]) || detail[field].length === 0 || !detail[field].every(isNonEmptyString)) {
          throw new Error(`compatibility ${entry.id} ${target} ${field} must contain actionable text`);
        }
      }
      if (!isNonEmptyString(detail.targetDifference)) {
        throw new Error(`compatibility ${entry.id} ${target} targetDifference must contain actionable text`);
      }
      assertArray(detail.exampleIds, `compatibility ${entry.id} ${target} exampleIds`);
      assertUnique(detail.exampleIds, value => value, `compatibility ${entry.id} ${target} example`);
      for (const exampleId of detail.exampleIds) {
        const example = examplesById.get(exampleId);
        if (example === undefined) {
          throw new Error(`compatibility ${entry.id} ${target} references unknown example ${exampleId}`);
        }
        if (example.input?.target !== target) {
          throw new Error(
            `compatibility ${entry.id} ${target} example ${exampleId} uses target ${String(example.input?.target)}`,
          );
        }
        if (!Array.isArray(example.directiveIds) || !example.directiveIds.includes(entry.id)) {
          throw new Error(
            `compatibility ${entry.id} ${target} example ${exampleId} is not evidence for that directive`,
          );
        }
      }
      if (!Array.isArray(detail.diagnosticCodes) || detail.diagnosticCodes.length === 0) {
        throw new Error(`compatibility ${entry.id} ${target} must link relevant diagnostics`);
      }
      assertUnique(detail.diagnosticCodes, value => value, `compatibility ${entry.id} ${target} diagnostic`);
      for (const code of detail.diagnosticCodes) {
        if (!diagnosticCodes.all.has(code)) {
          throw new Error(`compatibility ${entry.id} ${target} uses unknown diagnostic ${String(code)}`);
        }
      }
    }
  }
  await verifyEvidencePaths(root, registry, 'compatibility');
}

function compatibilityFamily(family) {
  const families = {
    flex: 'Flex',
    visibility: 'Visibility',
    grid: 'Grid',
    'class-style': 'Class/style',
    image: 'Image',
  };
  const label = families[family];
  if (label === undefined) throw new Error(`compatibility inventory has unknown family ${family}`);
  return label;
}

function compatibilityInventoryCategory(family) {
  return compatibilityCategory(compatibilityFamily(family));
}

async function verifyReportExamples(root, MigrationReportBuilder, conversionDiagnosticCodes) {
  const [registry, source, migrationModeSource] = await Promise.all([
    readRegistry(root, registryPaths.report, 'reportReference'),
    readFile(path.join(root, 'src/report/migration-report.ts'), 'utf8'),
    readFile(path.join(root, 'src/migrator/migration-mode.ts'), 'utf8'),
  ]);
  assertObject(registry, 'report registry');
  if (registry.schemaVersion !== 2)
    throw new Error(`report registry schema version must be 2, got ${registry.schemaVersion}`);
  assertArray(registry.fields, 'report field registry');
  assertUnique(registry.fields, item => item.path, 'report field');
  assertArray(registry.examples, 'report example registry');
  assertUnique(registry.examples, item => item.id, 'report example');

  const sourceFile = parseTypeScript('src/report/migration-report.ts', source);
  const migrationModeFile = parseTypeScript('src/migrator/migration-mode.ts', migrationModeSource);
  const migrationMode = stringLiterals(findTypeAlias(migrationModeFile, 'MigrationMode').type).join(' | ');
  const schemaVersionMember = findInterfaceMember(findInterface(sourceFile, 'MigrationReport'), 'schemaVersion');
  const implementedSchemaVersion = numericLiteral(schemaVersionMember.type);
  if (registry.schemaVersion !== implementedSchemaVersion) {
    throw new Error(
      `report registry schema version ${registry.schemaVersion} differs from implementation ${implementedSchemaVersion}`,
    );
  }

  const implementedFields = reportFields(sourceFile, migrationMode);
  assertExactSet(
    'report field registry',
    registry.fields.map(item => item.path),
    implementedFields.map(item => item.path),
  );
  const fieldsByPath = new Map(registry.fields.map(item => [item.path, item]));
  for (const implemented of implementedFields) {
    const documented = fieldsByPath.get(implemented.path);
    if (documented?.required !== implemented.required || documented.type !== implemented.type) {
      throw new Error(
        `report field registry differs for ${implemented.path}: documented ${JSON.stringify(documented)}, implemented ${JSON.stringify(implemented)}`,
      );
    }
  }

  for (const example of registry.examples) {
    validateReportExample(example, conversionDiagnosticCodes);
    const productionReport = rebuildReportExample(MigrationReportBuilder, example.value);
    if (JSON.stringify(productionReport) !== JSON.stringify(example.value)) {
      throw new Error(
        `report example ${String(example.id)} differs from production builder: expected ${JSON.stringify(example.value)}, received ${JSON.stringify(productionReport)}`,
      );
    }
  }
}

async function verifyTransformationExamples(root, previewTemplate, diagnosticCodes) {
  const registry = await readRegistry(root, registryPaths.examples, 'verifiedExamples');
  assertArray(registry, 'transformation example registry');
  assertUnique(registry, item => item.id, 'transformation example');
  await verifyEvidencePaths(root, registry, 'transformation example');

  for (const example of registry) {
    if (!Array.isArray(example.directiveIds) || example.directiveIds.length === 0) {
      throw new Error(`transformation example ${String(example.id)} has no directive IDs`);
    }
    assertUnique(example.directiveIds, value => value, `transformation example ${String(example.id)} directive`);
    const [input, output] = await Promise.all([
      readEvidenceFile(root, example.inputFixture),
      readEvidenceFile(root, example.expectedOutputFixture),
    ]);
    if (example.input?.source !== input) {
      throw new Error(
        `transformation example ${String(example.id)} input differs from ${String(example.inputFixture)}`,
      );
    }
    if (example.expectedOutput !== output) {
      throw new Error(
        `transformation example ${String(example.id)} output differs from ${String(example.expectedOutputFixture)}`,
      );
    }
    if (!['tailwind', 'css'].includes(example.input?.target)) {
      throw new Error(`transformation example ${String(example.id)} has an unknown target`);
    }
    if (!Array.isArray(example.expectedResults) || example.expectedResults.length === 0) {
      throw new Error(`transformation example ${String(example.id)} has no expected results`);
    }
    validateExpectedResults(example, diagnosticCodes);
    const result = previewTemplate(example.input);
    const productionResults = result.results.map(item =>
      item.status === 'converted' ? { status: item.status } : { status: item.status, code: item.code },
    );
    if (result.html !== example.expectedOutput || result.css !== example.expectedCss) {
      throw new Error(`transformation example ${String(example.id)} output differs from production preview`);
    }
    if (JSON.stringify(productionResults) !== JSON.stringify(example.expectedResults)) {
      throw new Error(`transformation example ${String(example.id)} results differ from production preview`);
    }
  }
}

async function loadProductionOracle(root) {
  const server = await createServer({
    root,
    configFile: false,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true },
  });
  try {
    const [previewModule, reportModule] = await Promise.all([
      server.ssrLoadModule('/src/browser/template-preview.ts'),
      server.ssrLoadModule('/src/report/migration-report.builder.ts'),
    ]);
    if (
      typeof previewModule.previewTemplate !== 'function' ||
      typeof reportModule.MigrationReportBuilder !== 'function'
    ) {
      throw new Error('production documentation oracle does not expose the required interfaces');
    }
    return {
      previewTemplate: previewModule.previewTemplate,
      MigrationReportBuilder: reportModule.MigrationReportBuilder,
      close: () => server.close(),
    };
  } catch (error) {
    await server.close();
    throw error;
  }
}

function validateExpectedResults(example, diagnosticCodes) {
  const statuses = new Set(['converted', 'review', 'unsupported', 'invalid', 'parse-error']);
  for (const result of example.expectedResults) {
    if (!statuses.has(result.status)) {
      throw new Error(`transformation example ${String(example.id)} uses unknown status ${String(result.status)}`);
    }
    if (result.status === 'converted') {
      if (result.code !== undefined) {
        throw new Error(`transformation example ${String(example.id)} gives a converted result a diagnostic code`);
      }
    } else if (!diagnosticCodes.all.has(result.code)) {
      throw new Error(
        `transformation example ${String(example.id)} uses unknown diagnostic code ${String(result.code)}`,
      );
    } else if (result.status === 'parse-error' && !diagnosticCodes.parse.has(result.code)) {
      throw new Error(
        `transformation example ${String(example.id)} uses diagnostic code ${String(result.code)} with parse-error status`,
      );
    } else if (result.status !== 'parse-error' && !diagnosticCodes.conversion.has(result.code)) {
      throw new Error(
        `transformation example ${String(example.id)} uses parse diagnostic code ${String(result.code)} with ${String(result.status)} status`,
      );
    }
  }
}

function cliContract(option) {
  return withoutUndefined({
    longFlag: option.longFlag,
    shortFlag: option.shortFlag,
    valueName: option.valueName,
    description: option.description,
    defaultValue: option.defaultValue,
    choices: option.choices,
  });
}

function parseCliDefinitions(source) {
  const sourceFile = parseTypeScript('src/cli/run-cli.ts', source);
  const options = [];

  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (method === 'option') {
        const flags = literalValue(node.arguments[0]);
        const description = literalValue(node.arguments[1]);
        if (typeof flags === 'string' && typeof description === 'string') {
          const option = { ...parseFlags(flags), description };
          if (node.arguments.length >= 3) option.defaultValue = literalValue(node.arguments[2]);
          options.push(option);
        }
      } else if (method === 'version') {
        const flags = literalValue(node.arguments[1]) ?? '-V, --version';
        const description = literalValue(node.arguments[2]) ?? 'output the version number';
        if (typeof flags !== 'string' || typeof description !== 'string') {
          throw new Error('Commander version metadata must use literal flags and description');
        }
        options.push({
          ...parseFlags(flags),
          description,
        });
      }
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Option') {
      const flags = literalValue(node.arguments?.[0]);
      const description = literalValue(node.arguments?.[1]);
      if (typeof flags === 'string' && typeof description === 'string') {
        const option = { ...parseFlags(flags), description };
        const addOption = enclosingCall(node, 'addOption');
        if (addOption !== undefined) {
          const choices = chainedMethodArgument(addOption.arguments[0], 'choices');
          const defaultValue = chainedMethodArgument(addOption.arguments[0], 'default');
          if (Array.isArray(choices)) option.choices = choices;
          if (defaultValue !== undefined) option.defaultValue = defaultValue;
        }
        options.push(option);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return options;
}

async function verifyCliEvidencePaths(root, registry) {
  for (const option of registry) {
    if (!Array.isArray(option.evidence) || !option.evidence.includes('src/cli/run-cli.ts')) {
      throw new Error(`CLI option ${String(option.longFlag)} evidence must include src/cli/run-cli.ts`);
    }
    for (const evidence of option.evidence) {
      let source;
      try {
        source = await readEvidenceFile(root, evidence);
      } catch {
        throw new Error(`CLI option ${String(option.longFlag)} evidence does not exist: ${String(evidence)}`);
      }
      const relevant =
        source.includes(option.longFlag) ||
        (option.longFlag === '--version' && evidence === 'src/cli/run-cli.ts' && source.includes('.version(')) ||
        (option.longFlag === '--version' && evidence === 'package.json' && source.includes('"version"'));
      if (!relevant) {
        throw new Error(`CLI option ${String(option.longFlag)} evidence is not relevant: ${String(evidence)}`);
      }
    }
  }
}

function enclosingCall(node, method) {
  let current = node.parent;
  while (current !== undefined) {
    if (
      ts.isCallExpression(current) &&
      ts.isPropertyAccessExpression(current.expression) &&
      current.expression.name.text === method
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

function chainedMethodArgument(node, method) {
  let result;
  function visit(candidate) {
    if (
      ts.isCallExpression(candidate) &&
      ts.isPropertyAccessExpression(candidate.expression) &&
      candidate.expression.name.text === method
    ) {
      result = literalValue(candidate.arguments[0]);
    }
    ts.forEachChild(candidate, visit);
  }
  if (node !== undefined) visit(node);
  return result;
}

function parseFlags(flags) {
  const longFlag = flags.match(/--[a-z][a-z-]*/u)?.[0];
  if (longFlag === undefined) throw new Error(`Commander option has no long flag: ${flags}`);
  const shortFlag = flags.match(/(?:^|,\s*)(-[A-Za-z])(?:,|\s|$)/u)?.[1];
  const valueName = flags.match(/[<[]([^>\]]+)[>\]]/u)?.[1];
  return withoutUndefined({ longFlag, shortFlag, valueName });
}

function parseCompatibilityTable(source) {
  const inventory = source.match(
    /<!-- compatibility-inventory:start -->([\s\S]*?)<!-- compatibility-inventory:end -->/u,
  )?.[1];
  if (inventory === undefined) throw new Error('compatibility contract markers are missing');
  const entries = [];
  for (const line of inventory.split(/\r?\n/u)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map(cell => cell.trim());
    if (cells.length !== 5 || !/^`[^`]+`$/u.test(cells[0] ?? '')) continue;
    const id = cells[0].slice(1, -1);
    const directiveFamily = cells[1];
    entries.push({
      id,
      directiveFamily,
      category: compatibilityCategory(directiveFamily),
      tailwind: compatibilityStatus(cells[2]),
      css: compatibilityStatus(cells[3]),
    });
  }
  if (entries.length === 0) throw new Error('compatibility contract has no inventory entries');
  return entries;
}

function compatibilityCategory(family) {
  const categories = {
    Flex: 'flex',
    Visibility: 'visibility',
    Grid: 'grid',
    'Class/style': 'responsive-class-style',
    Image: 'images',
  };
  const category = categories[family];
  if (category === undefined) throw new Error(`compatibility contract has unknown family ${family}`);
  return category;
}

function compatibilityStatus(status) {
  const normalized = status.toLowerCase().replaceAll(' ', '-');
  if (!['limited', 'preserved', 'planned', 'not-applicable'].includes(normalized)) {
    throw new Error(`compatibility contract has unknown status ${status}`);
  }
  return normalized;
}

function compatibilityContract(entry) {
  return {
    id: entry.id,
    directiveFamily: entry.directiveFamily,
    category: entry.category,
    tailwind: entry.tailwind,
    css: entry.css,
  };
}

function reportFields(sourceFile, migrationMode) {
  const migrationReport = interfaceMembers(findInterface(sourceFile, 'MigrationReport'));
  const summary = interfaceMembers(findInterface(sourceFile, 'MigrationSummary'));
  const fileReport = interfaceMembers(findInterface(sourceFile, 'FileReport'));
  const stylesheet = interfaceMembers(findInterface(sourceFile, 'StylesheetReport'));
  const application = unionMembers(findTypeAlias(sourceFile, 'MigrationApplication').type);
  const result = unionMembers(findTypeAlias(sourceFile, 'ReportResult').type);
  const fields = [];

  for (const member of migrationReport) {
    fields.push(reportField(member.name, member, member.name === 'mode' ? migrationMode : undefined));
    if (member.name === 'application') {
      fields.push(...application.map(item => reportField(`application.${item.name}`, item)));
    } else if (member.name === 'summary') {
      fields.push(...summary.map(item => reportField(`summary.${item.name}`, item)));
    } else if (member.name === 'files') {
      for (const fileMember of fileReport) {
        fields.push(reportField(`files[].${fileMember.name}`, fileMember));
        if (fileMember.name === 'results') {
          fields.push(...result.map(item => reportField(`files[].results[].${item.name}`, item)));
        }
      }
    } else if (member.name === 'stylesheet') {
      fields.push(...stylesheet.map(item => reportField(`stylesheet.${item.name}`, item)));
    }
  }
  return fields;
}

function reportField(pathName, member, typeOverride) {
  return { path: pathName, type: typeOverride ?? describeType(member.type), required: member.required };
}

function interfaceMembers(declaration) {
  return declaration.members.filter(ts.isPropertySignature).map(member => ({
    name: propertyName(member.name),
    type: member.type,
    required: member.questionToken === undefined,
  }));
}

function unionMembers(typeNode) {
  const variants = flattenUnion(typeNode).map(unwrapType).filter(ts.isTypeLiteralNode);
  if (variants.length === 0) throw new Error('Expected a union of object types');
  const names = [];
  for (const variant of variants) {
    for (const member of variant.members.filter(ts.isPropertySignature)) {
      const name = propertyName(member.name);
      if (!names.includes(name)) names.push(name);
    }
  }
  return names.map(name => {
    const matching = variants.flatMap(variant =>
      variant.members.filter(ts.isPropertySignature).filter(member => propertyName(member.name) === name),
    );
    return {
      name,
      type: combineTypes(matching.map(member => member.type)),
      required: matching.length === variants.length && matching.every(member => member.questionToken === undefined),
    };
  });
}

function combineTypes(types) {
  const nodes = types.flatMap(flattenUnion);
  if (nodes.some(node => describeType(node) === 'string')) {
    return ts.factory.createKeywordTypeNode(ts.SyntaxKind.StringKeyword);
  }
  const unique = [];
  const seen = new Set();
  for (const node of nodes) {
    const description = describeType(node);
    if (seen.has(description)) continue;
    seen.add(description);
    unique.push(node);
  }
  return unique.length === 1 ? unique[0] : ts.factory.createUnionTypeNode(unique);
}

function describeType(typeNode) {
  const node = unwrapType(typeNode);
  if (ts.isLiteralTypeNode(node)) return String(literalValue(node.literal));
  if (node.kind === ts.SyntaxKind.StringKeyword) return 'string';
  if (node.kind === ts.SyntaxKind.NumberKeyword) return 'number';
  if (node.kind === ts.SyntaxKind.BooleanKeyword) return 'boolean';
  if (ts.isTypeReferenceNode(node)) return node.typeName.getText();
  if (ts.isArrayTypeNode(node)) return `${describeType(node.elementType)}[]`;
  if (ts.isTypeOperatorNode(node) && node.operator === ts.SyntaxKind.ReadonlyKeyword) return describeType(node.type);
  if (ts.isUnionTypeNode(node)) return node.types.map(describeType).join(' | ');
  throw new Error(`Unsupported report type syntax: ${node.getText()}`);
}

function validateReportExample(example, conversionDiagnosticCodes) {
  if (!isNonEmptyString(example.id) || !isNonEmptyString(example.description)) {
    throw new Error('report example registry contains an incomplete entry');
  }
  const report = JSON.parse(JSON.stringify(example.value));
  assertExactKeys(
    report,
    ['schemaVersion', 'mode', 'target', 'application', 'input', 'output', 'durationMs', 'summary', 'files'],
    ['stylesheet'],
    `report example ${example.id}`,
  );
  if (report.schemaVersion !== 2) throw new Error(`report example ${example.id} has an invalid schema version`);
  assertEnum(report.mode, ['plan', 'write'], `report example ${example.id} mode`);
  assertEnum(report.target, ['css', 'tailwind'], `report example ${example.id} target`);
  assertNonNegativeNumber(report.durationMs, `report example ${example.id} durationMs`);
  if (!isNonEmptyString(report.input) || !isNonEmptyString(report.output)) {
    throw new Error(`report example ${example.id} has invalid input or output paths`);
  }
  if ((report.target === 'css') !== (report.stylesheet !== undefined)) {
    throw new Error(`report example ${example.id} must include stylesheet exactly for the css target`);
  }
  validateApplication(report.application, example.id);
  assertArray(report.files, `report example ${example.id} files`);

  const counts = { converted: 0, review: 0, unsupported: 0, invalid: 0, parseErrors: 0 };
  let changed = 0;
  for (const file of report.files) {
    assertExactKeys(file, ['path', 'changed', 'results'], [], `report example ${example.id} file`);
    if (!isNonEmptyString(file.path) || typeof file.changed !== 'boolean') {
      throw new Error(`report example ${example.id} has an invalid file entry`);
    }
    if (file.changed) changed += 1;
    assertArray(file.results, `report example ${example.id} results`);
    for (const result of file.results) {
      validateReportResult(result, example.id, conversionDiagnosticCodes);
      const countName = result.status === 'parse-error' ? 'parseErrors' : result.status;
      counts[countName] += 1;
    }
  }
  const expectedSummary = { filesScanned: report.files.length, filesChanged: changed, ...counts };
  assertExactKeys(report.summary, Object.keys(expectedSummary), [], `report example ${example.id} summary`);
  if (Object.entries(expectedSummary).some(([key, value]) => report.summary[key] !== value)) {
    throw new Error(
      `report example ${example.id} summary ${JSON.stringify(report.summary)} differs from derived ${JSON.stringify(expectedSummary)}`,
    );
  }
  const expectedApplication =
    report.mode === 'plan'
      ? { status: 'skipped', reason: 'plan-only' }
      : counts.parseErrors > 0
        ? { status: 'skipped', reason: 'parse-errors' }
        : { status: 'applied' };
  if (JSON.stringify(report.application) !== JSON.stringify(expectedApplication)) {
    throw new Error(
      `report example ${example.id} application ${JSON.stringify(report.application)} differs from ${JSON.stringify(expectedApplication)}`,
    );
  }
  if (report.stylesheet !== undefined) {
    assertExactKeys(report.stylesheet, ['path', 'change'], [], `report example ${example.id} stylesheet`);
    if (!isNonEmptyString(report.stylesheet.path))
      throw new Error(`report example ${example.id} stylesheet path is invalid`);
    assertEnum(
      report.stylesheet.change,
      ['created', 'updated', 'removed', 'unchanged'],
      `report example ${example.id} stylesheet change`,
    );
  }
}

function rebuildReportExample(MigrationReportBuilder, report) {
  const files = report.files.map(file => ({
    inputPath: file.path === report.input ? report.input : path.posix.join(report.input, file.path),
    outputPath: file.path === report.output ? report.output : path.posix.join(report.output, file.path),
    changed: file.changed,
    results: file.results.map(result => reportConversionResult(report.input, result)),
  }));
  return new MigrationReportBuilder().build(
    report.input,
    report.output,
    report.target,
    report.mode,
    report.application,
    report.durationMs,
    files,
    report.stylesheet,
  );
}

function reportConversionResult(fileName, result) {
  if (result.status === 'parse-error') {
    return {
      status: result.status,
      fileName,
      code: result.code,
      reason: result.reason,
      source: { start: result.offset, end: result.offset + 1 },
    };
  }
  const input = {
    id: `${fileName}:${result.offset}`,
    fileName,
    elementId: String(result.offset),
    sourceName: result.sourceName,
    directive: result.directive,
    value: '',
    binding: 'literal',
    breakpoint: undefined,
    source: { start: result.offset, end: result.offset + 1 },
    nameSource: { start: result.offset, end: result.offset + 1 },
  };
  if (result.status === 'converted') return { status: result.status, input };
  return {
    status: result.status,
    input,
    code: result.code,
    reason: result.reason,
    suggestion: result.suggestion,
  };
}

function validateApplication(application, id) {
  assertObject(application, `report example ${id} application`);
  if (application.status === 'applied') {
    assertExactKeys(application, ['status'], [], `report example ${id} application`);
    return;
  }
  assertExactKeys(application, ['status', 'reason'], [], `report example ${id} application`);
  if (application.status !== 'skipped') throw new Error(`report example ${id} application status is invalid`);
  assertEnum(application.reason, ['plan-only', 'parse-errors'], `report example ${id} application reason`);
}

function validateReportResult(result, id, conversionDiagnosticCodes) {
  assertObject(result, `report example ${id} result`);
  if (result.status === 'converted') {
    assertExactKeys(result, ['status', 'directive', 'sourceName', 'offset'], [], `report example ${id} result`);
  } else if (['review', 'unsupported', 'invalid'].includes(result.status)) {
    assertExactKeys(
      result,
      ['status', 'directive', 'sourceName', 'offset', 'code', 'reason', 'suggestion'],
      [],
      `report example ${id} result`,
    );
    if (!conversionDiagnosticCodes.has(result.code)) {
      throw new Error(`report example ${id} uses unknown diagnostic code ${String(result.code)}`);
    }
  } else if (result.status === 'parse-error') {
    assertExactKeys(result, ['status', 'offset', 'code', 'reason'], [], `report example ${id} result`);
    assertEnum(
      result.code,
      ['template-parse-error', 'generated-template-parse-error'],
      `report example ${id} parse code`,
    );
  } else {
    throw new Error(`report example ${id} result has invalid status ${String(result.status)}`);
  }
  assertNonNegativeNumber(result.offset, `report example ${id} result offset`);
  for (const key of ['directive', 'sourceName', 'code', 'reason', 'suggestion']) {
    if (key in result && !isNonEmptyString(result[key])) {
      throw new Error(`report example ${id} result ${key} is invalid`);
    }
  }
}

function assertExactKeys(value, required, optional, label) {
  assertObject(value, label);
  const keys = Object.keys(value).sort();
  const allowed = [...required, ...optional];
  for (const key of required) if (!(key in value)) throw new Error(`${label} is missing ${key}`);
  const unknown = keys.filter(key => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${label} has unknown fields: ${unknown.join(', ')}`);
}

function assertEnum(value, values, label) {
  if (!values.includes(value)) throw new Error(`${label} must be one of ${values.join(', ')}`);
}

function assertNonNegativeNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${label} is invalid`);
}

async function verifyEvidencePaths(root, entries, label) {
  await Promise.all(
    entries.flatMap(entry => {
      if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
        throw new Error(`${label} ${String(entry.id)} has no evidence paths`);
      }
      return entry.evidence.map(async evidence => {
        try {
          await access(resolveEvidencePath(root, evidence));
        } catch {
          throw new Error(`${label} ${String(entry.id)} evidence does not exist: ${String(evidence)}`);
        }
      });
    }),
  );
}

async function readEvidenceFile(root, evidence) {
  return readFile(resolveEvidencePath(root, evidence), 'utf8');
}

function resolveEvidencePath(root, evidence) {
  if (!isNonEmptyString(evidence)) throw new Error('documentation evidence path must be a non-empty string');
  const resolved = path.resolve(root, evidence);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new Error(`documentation evidence path escapes the project root: ${evidence}`);
  }
  return resolved;
}

async function readRegistry(root, relativePath, exportName) {
  const source = await readFile(path.join(root, relativePath), 'utf8');
  return evaluateExport(parseTypeScript(relativePath, source), exportName);
}

function parseTypeScript(fileName, source) {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sourceFile.parseDiagnostics.length > 0) {
    const message = ts.flattenDiagnosticMessageText(sourceFile.parseDiagnostics[0].messageText, '\n');
    throw new Error(`${fileName} cannot be parsed: ${message}`);
  }
  return sourceFile;
}

function evaluateExport(sourceFile, exportName) {
  const declarations = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer !== undefined) {
        declarations.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  if (!declarations.has(exportName)) throw new Error(`${sourceFile.fileName} does not define ${exportName}`);
  return evaluateNode(declarations.get(exportName), declarations, new Set());
}

function evaluateNode(node, declarations, active) {
  const value = unwrapExpression(node);
  if (ts.isArrayLiteralExpression(value)) {
    return value.elements.map(item => evaluateNode(item, declarations, active));
  }
  if (ts.isObjectLiteralExpression(value)) {
    return Object.fromEntries(
      value.properties.map(property => {
        if (ts.isPropertyAssignment(property)) {
          return [propertyName(property.name), evaluateNode(property.initializer, declarations, active)];
        }
        if (ts.isShorthandPropertyAssignment(property)) {
          return [property.name.text, evaluateIdentifier(property.name.text, declarations, active)];
        }
        throw new Error(`Unsupported registry property syntax: ${property.getText()}`);
      }),
    );
  }
  if (ts.isCallExpression(value)) {
    if (value.arguments.length === 0) throw new Error(`Registry call has no value argument: ${value.getText()}`);
    return evaluateNode(value.arguments[0], declarations, active);
  }
  if (ts.isIdentifier(value)) {
    if (value.text === 'undefined') return undefined;
    return evaluateIdentifier(value.text, declarations, active);
  }
  return literalValue(value);
}

function evaluateIdentifier(name, declarations, active) {
  const declaration = declarations.get(name);
  if (declaration === undefined) throw new Error(`Registry value refers to unsupported identifier ${name}`);
  if (active.has(name)) throw new Error(`Registry value contains a cycle through ${name}`);
  active.add(name);
  const value = evaluateNode(declaration, declarations, active);
  active.delete(name);
  return value;
}

function unwrapExpression(node) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function unwrapType(node) {
  let current = node;
  while (ts.isParenthesizedTypeNode(current)) current = current.type;
  return current;
}

function literalValue(node) {
  if (node === undefined) return undefined;
  const value = unwrapExpression(node);
  if (ts.isStringLiteralLike(value) || ts.isNumericLiteral(value)) {
    return ts.isNumericLiteral(value) ? Number(value.text) : value.text;
  }
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (value.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(value)) return value.elements.map(item => literalValue(item));
  throw new Error(`Unsupported literal syntax: ${value.getText()}`);
}

function findTypeAlias(sourceFile, name) {
  const declaration = sourceFile.statements.find(
    statement => ts.isTypeAliasDeclaration(statement) && statement.name.text === name,
  );
  if (declaration === undefined) throw new Error(`${sourceFile.fileName} does not define type ${name}`);
  return declaration;
}

function findInterface(sourceFile, name) {
  const declaration = sourceFile.statements.find(
    statement => ts.isInterfaceDeclaration(statement) && statement.name.text === name,
  );
  if (declaration === undefined) throw new Error(`${sourceFile.fileName} does not define interface ${name}`);
  return declaration;
}

function findInterfaceMember(declaration, name) {
  const member = declaration.members.find(item => ts.isPropertySignature(item) && propertyName(item.name) === name);
  if (member === undefined || !ts.isPropertySignature(member) || member.type === undefined) {
    throw new Error(`${declaration.name.text} does not define field ${name}`);
  }
  return member;
}

function propertyName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) return name.text;
  throw new Error(`Unsupported property name: ${name.getText()}`);
}

function flattenUnion(typeNode) {
  const type = unwrapType(typeNode);
  return ts.isUnionTypeNode(type) ? type.types.flatMap(flattenUnion) : [type];
}

function stringLiterals(typeNode) {
  return flattenUnion(typeNode).map(node => {
    const literal = unwrapType(node);
    if (!ts.isLiteralTypeNode(literal) || !ts.isStringLiteralLike(literal.literal)) {
      throw new Error(`Expected a string-literal union, found ${literal.getText()}`);
    }
    return literal.literal.text;
  });
}

function numericLiteral(typeNode) {
  const literal = unwrapType(typeNode);
  if (!ts.isLiteralTypeNode(literal) || !ts.isNumericLiteral(literal.literal)) {
    throw new Error(`Expected a numeric literal, found ${literal.getText()}`);
  }
  return Number(literal.literal.text);
}

function assertExactSet(label, documented, implemented) {
  const documentedSet = new Set(documented);
  const implementedSet = new Set(implemented);
  const missing = [...implementedSet].filter(item => !documentedSet.has(item)).sort();
  const stale = [...documentedSet].filter(item => !implementedSet.has(item)).sort();
  if (missing.length > 0 || stale.length > 0) {
    throw new Error(`${label} differs: missing [${missing.join(', ')}], stale [${stale.join(', ')}]`);
  }
}

function assertUnique(items, key, label) {
  const seen = new Set();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) throw new Error(`duplicate ${label}: ${String(value)}`);
    seen.add(value);
  }
}

function assertArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
}

function assertObject(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function withoutUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

const invokedPath = process.argv[1] === undefined ? undefined : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = process.argv[2] ?? process.cwd();
  try {
    await verifyDocumentationContract(root);
    process.stdout.write('Documentation contract verified.\n');
  } catch (error) {
    process.stderr.write(
      `Documentation contract verification failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
