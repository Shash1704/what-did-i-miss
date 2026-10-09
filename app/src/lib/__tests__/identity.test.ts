import { describe, expect, it } from 'vitest'
import { displayName, isMe, mentionPattern, myNames, nameSuggestions } from '../identity'

const me = 'Shashwat, Shash, @shashwat_p, +91 98765 43210'
const mentions = (text: string) => new RegExp(`(${mentionPattern(me)})`, 'i').test(text)

describe('identity', () => {
  it('splits aliases and picks a display name', () => {
    expect(myNames(me)).toEqual(['Shashwat', 'Shash', 'shashwat_p', '+91 98765 43210'])
    expect(displayName(me)).toBe('Shashwat')
    expect(displayName('98765 43210')).toBe('98765 43210')
    expect(displayName('')).toBe('You')
  })

  it('recognises your own messages', () => {
    expect(isMe('Shashwat Prakash', me)).toBe(true)
    expect(isMe('shash', me)).toBe(true)
    expect(isMe('+91 98765 43210', me)).toBe(true)
    expect(isMe('You', '')).toBe(true)
    expect(isMe('Ananya', me)).toBe(false)
  })

  it('matches every way people mention you', () => {
    expect(mentions('@Shashwat can you send it?')).toBe(true)
    expect(mentions('shashwat bro accept the invite')).toBe(true)
    expect(mentions('@shashwat_p book the hall')).toBe(true)
    expect(mentions('@919876543210 please reply')).toBe(true)
    expect(mentions('Shashank will do it')).toBe(false)
    expect(mentions('ok see you all')).toBe(false)
  })

  it('never matches when no identity is set', () => {
    expect(new RegExp(`(${mentionPattern('')})`, 'i').test('@anyone hi')).toBe(false)
  })

  it('suggests posters plus @mentioned names', () => {
    expect(nameSuggestions(['Ananya'], ['@Shashwat pls', '@everyone hi', '@ananya ok'])).toEqual(['Ananya', 'Shashwat'])
  })
})
