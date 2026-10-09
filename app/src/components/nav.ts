/** Navigation callbacks shared by the views. */
export type View = 'brief' | 'insights' | 'chat'

export interface Nav {
  /** Open the full chat scrolled to a message, highlighted. */
  jump: (messageId: number) => void
  /** Switch view and scroll to an element id ('top' for the start). */
  go: (view: View, anchor?: string) => void
  /** Search the chat for a word. */
  search: (query: string) => void
}
