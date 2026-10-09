/** Hand the user a file generated in the browser (no upload, no server). */
export function downloadFile(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = Object.assign(document.createElement('a'), { href: url, download: filename })
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** A safe file name from free text (chat names can contain anything). */
export const safeFileName = (name: string, fallback = 'chat'): string => name.replace(/[^\w -]/g, '').trim() || fallback
