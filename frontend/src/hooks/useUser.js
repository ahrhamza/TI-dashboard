import { useState } from 'react'
import Cookies from 'js-cookie'

const COOKIE_NAME = 'socfeed_user'
const COOKIE_EXPIRES = 90 // days

export function useUser() {
  const [name, setName] = useState(() => Cookies.get(COOKIE_NAME) || '')

  function saveName(newName) {
    const trimmed = newName.trim()
    if (!trimmed) return
    Cookies.set(COOKIE_NAME, trimmed, { expires: COOKIE_EXPIRES })
    setName(trimmed)
  }

  return { name, saveName, hasName: !!name }
}
