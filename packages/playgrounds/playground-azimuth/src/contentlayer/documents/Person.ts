import { defineDocument } from 'contentlayer/source-local/schema'

export const Person = defineDocument(() => ({
  name: 'Person',
  filePathPattern: 'data/authors/*.yaml',
  fileType: 'yaml',
  fields: {
    first_name: { type: 'string' },
    last_name: { type: 'string' },
    bio: { type: 'markdown' },
    photo: { type: 'image' },
  },
  extensions: {
    stackbit: { folder: 'authors' },
  },
}))
