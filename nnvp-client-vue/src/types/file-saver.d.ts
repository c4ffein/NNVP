// file-saver ships no type declarations, and pulling in @types/file-saver
// would add a dependency for the one function the app uses — declare it here.
declare module 'file-saver' {
  export function saveAs(data: Blob | string, filename?: string): void;
}
