import { inflection, lowercaseFirstChar, pattern, traceAsyncFn, uppercaseFirstChar } from '@contentlayer/utils'
import { promises as fs } from 'fs'
import * as path from 'path'
import type { Observable } from 'rxjs'
import { of } from 'rxjs'
import { combineLatest, defer } from 'rxjs'
import { switchMap } from 'rxjs/operators'
import type { JsonArray, PackageJson } from 'type-fest'

import type { Cache } from '..'
import type { SourcePlugin, SourcePluginType } from '../plugin'
import type { DocumentDef, SchemaDef } from '../schema'
import { makeArtifactsDir } from '../utils'
import { renderDocumentOrObjectDef } from './generate-types'

export const generateDotpkg = ({
  source,
  watchData,
}: {
  source: SourcePlugin
  watchData: boolean
}): Observable<void> => {
  return combineLatest({
    cache: source.fetchData({ watch: watchData, force: true, previousCache: undefined }),
    schemaDef: defer(async () => source.provideSchema()),
    targetPath: defer(async () => makeArtifactsDir()),
    sourcePluginType: of(source.type),
  }).pipe(switchMap(writeFilesForCache))
}

const writeFilesForCache = traceAsyncFn('@contentlayer/core/commands/generate-dotpkg:writeFilesForCache')(
  async ({
    cache,
    schemaDef,
    targetPath,
    sourcePluginType,
  }: {
    schemaDef: SchemaDef
    cache: Cache
    targetPath: string
    sourcePluginType: SourcePluginType
  }): Promise<void> => {
    const withPrefix = (...path_: string[]) => path.join(targetPath, ...path_)

    const dataFiles = Object.values(schemaDef.documentDefMap).map((docDef) => ({
      name: getDataVariableName({ docDef }),
      content: makeDocumentDataFile({
        docDef,
        data: cache.documents.filter((_) => _._typeName === docDef.name),
      }),
    }))

    await Promise.all([mkdir(withPrefix('types')), mkdir(withPrefix('data'))])

    await Promise.all([
      generateFile({ filePath: withPrefix('package.json'), content: makePackageJson() }),
      generateFile({
        filePath: withPrefix('types', 'index.d.ts'),
        content: makeTypes({ schemaDef, sourcePluginType }),
      }),
      generateFile({ filePath: withPrefix('types', 'index.js'), content: makeHelperTypes() }),
      generateFile({ filePath: withPrefix('data', 'index.d.ts'), content: makeDataTypes({ schemaDef }) }),
      generateFile({ filePath: withPrefix('data', 'index.js'), content: makeIndexJs({ schemaDef }) }),
      ...dataFiles.map(({ name, content }) => generateFile({ filePath: withPrefix('data', `${name}.js`), content })),
    ])
  },
)

const makePackageJson = (): string => {
  const packageJson: PackageJson & { typesVersions: any } = {
    name: 'dot-contentlayer',
    description: 'This package is auto-generated by Contentlayer',
    version: '0.0.0',
    exports: {
      './data': {
        import: './data/index.js',
      },
      './types': {
        import: './types/index.js',
      },
    },
    typesVersions: {
      '*': {
        data: ['./data'],
        types: ['./types'],
      },
    },
  }

  return JSON.stringify(packageJson, null, 2)
}

const mkdir = async (dirPath: string) => {
  try {
    await fs.mkdir(dirPath)
  } catch (e) {
    if (e.code !== 'EEXIST') {
      throw e
    }
  }
}

const generateFile = async ({ filePath, content }: { filePath: string; content: string }): Promise<void> => {
  await fs.writeFile(filePath, content, 'utf8')
}

const makeDocumentDataFile = ({ docDef, data }: { docDef: DocumentDef; data: JsonArray }): string => {
  const dataVariableName = getDataVariableName({ docDef })
  const data_ = docDef.isSingleton ? data[0] : data
  return `\
// ${autogeneratedNote}

export const ${dataVariableName} = ${JSON.stringify(data_, null, 2)}
`
}

const makeIndexJs = ({ schemaDef }: { schemaDef: SchemaDef }): string => {
  const dataVariableNames = Object.values(schemaDef.documentDefMap).map(
    (docDef) => [docDef, getDataVariableName({ docDef })] as const,
  )
  const constReexports = dataVariableNames
    .map(([, dataVariableName]) => `export * from './${dataVariableName}.js'`)
    .join('\n')

  const constImportsForAllDocuments = dataVariableNames
    .map(([, dataVariableName]) => `import { ${dataVariableName} } from './${dataVariableName}.js'`)
    .join('\n')

  const allDocuments = dataVariableNames
    .map(([docDef, dataVariableName]) => (docDef.isSingleton ? dataVariableName : `...${dataVariableName}`))
    .join(', ')

  return `\
// ${autogeneratedNote}

export { isType } from 'contentlayer/client'

${constReexports}
${constImportsForAllDocuments}

export const allDocuments = [${allDocuments}]
`
}

const autogeneratedNote = `NOTE This file is auto-generated by the Contentlayer CLI`

const makeTypes = ({
  schemaDef,
  sourcePluginType,
}: {
  schemaDef: SchemaDef
  sourcePluginType: SourcePluginType
}): string => {
  const documentTypes = Object.values(schemaDef.documentDefMap)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((def) => ({
      typeName: def.name,
      typeDef: renderDocumentOrObjectDef({ def, sourcePluginType }),
    }))

  const objectTypes = Object.values(schemaDef.objectDefMap)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((def) => ({
      typeName: def.name,
      typeDef: renderDocumentOrObjectDef({ def, sourcePluginType }),
    }))

  // TODO this might be no longer needed and can be removed once `isType` has been refactored
  // to not depend on global types
  const typeMap = documentTypes
    .map((_) => _.typeName)
    .map((_) => `  ${_}: ${_}`)
    .join('\n')

  const importsForRawTypes = pattern
    .match(sourcePluginType)
    .with('local', () => `import * as Local from 'contentlayer/source-local'`)
    .with('contentful', () => `import * as Contentful from '@contentlayer/source-contentful'`)
    .otherwise(() => ``)

  return `\
// ${autogeneratedNote}

import type { Markdown, MDX } from 'contentlayer/core'
${importsForRawTypes}

export { isType } from 'contentlayer/client'

export type Image = string
export type { Markdown, MDX }

export interface ContentlayerGenTypes {
  documentTypes: DocumentTypes
  documentTypeMap: DocumentTypeMap
  documentTypeNames: DocumentTypeNames
  allTypeNames: AllTypeNames
}

declare global {
  interface ContentlayerGen extends ContentlayerGenTypes {}
}

export type DocumentTypeMap = {
${typeMap}
}

export type AllTypes = DocumentTypes | ObjectTypes
export type AllTypeNames = DocumentTypeNames | ObjectTypeNames

export type DocumentTypes = ${documentTypes.map((_) => _.typeName).join(' | ')}
export type DocumentTypeNames = DocumentTypes['_typeName']

export type ObjectTypes = ${objectTypes.length > 0 ? objectTypes.map((_) => _.typeName).join(' | ') : 'never'}
export type ObjectTypeNames = ObjectTypes['_typeName']



/** Document types */
${documentTypes.map((_) => _.typeDef).join('\n\n')}  

/** Object types */
${objectTypes.map((_) => _.typeDef).join('\n\n')}  
  
 `
}

const makeHelperTypes = (): string => {
  return `\
// ${autogeneratedNote}

export { isType } from 'contentlayer/client'
`
}

const makeDataTypes = ({ schemaDef }: { schemaDef: SchemaDef }): string => {
  const dataConsts = Object.values(schemaDef.documentDefMap)
    .map((docDef) => [docDef, docDef.name, getDataVariableName({ docDef })] as const)
    .map(
      ([docDef, typeName, dataVariableName]) =>
        `export declare const ${dataVariableName}: ${typeName}${docDef.isSingleton ? '' : '[]'}`,
    )
    .join('\n')

  const documentTypeNames = Object.values(schemaDef.documentDefMap)
    .map((docDef) => docDef.name)
    .join(', ')

  return `\
// ${autogeneratedNote}

import { ${documentTypeNames}, DocumentTypes } from '../types'

${dataConsts}

export declare const allDocuments: DocumentTypes[]

`
}

const getDataVariableName = ({ docDef }: { docDef: DocumentDef }): string => {
  if (docDef.isSingleton) {
    return lowercaseFirstChar(inflection.singularize(docDef.name))
  } else {
    return 'all' + uppercaseFirstChar(inflection.pluralize(docDef.name))
  }
}
