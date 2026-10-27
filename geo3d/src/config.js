// Where the model assets live. In dev, Vite serves ./public at the site root; the built app sits
// in ./dist and reaches the same files through ../public/data.
export const DATA_BASE = import.meta.env.DEV ? '/data' : '../public/data'
export const APP_VERSION = '1.0.0'
