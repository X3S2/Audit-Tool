import { useEffect, useRef, useState } from 'react'
import { getAuthToken } from '../session'

// Lädt ein ausgelagertes Bild (z. B. "/api/media/{name}") per authentifiziertem fetch() statt über ein
// einfaches <img src="..."> - der Server verlangt für /api/media eine gültige Bearer-Authorization, ein
// roher <img>-Tag könnte den Header nicht mitschicken. Lädt erst, sobald das Element in den sichtbaren
// Bereich scrollt (IntersectionObserver), hält maximal 4 Downloads gleichzeitig aktiv und cached einmal
// geladene Bilder (als Object-URL) für die gesamte Seiten-Sitzung, damit dieselbe Datei an mehreren
// Stellen (z. B. Thumbnail + Galerie) nicht mehrfach heruntergeladen wird. Alte, noch nicht migrierte
// Bilder (eingebettete "data:image/...;base64,..."-Werte aus älteren Backups) werden unverändert direkt
// dargestellt, da sie keinen authentifizierten Abruf benötigen.
type AuthImageProps = {
  src: string
  // Wird geladen, falls "src" nicht existiert (z. B. ein Thumbnail, das für ältere/migrierte Bilder nie
  // erzeugt wurde) - typischerweise das zugehörige Vollbild.
  fallbackSrc?: string
} & Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'>

const blobUrlCache = new Map<string, string>()
const pendingLoads = new Map<string, Promise<string>>()
const loadQueue: Array<() => void> = []
let activeLoads = 0
const MAX_CONCURRENT_LOADS = 4

function runNextQueued() {
  if (activeLoads >= MAX_CONCURRENT_LOADS) return
  const next = loadQueue.shift()
  if (next) {
    activeLoads++
    next()
  }
}

function loadAuthenticatedImage(src: string): Promise<string> {
  const cached = blobUrlCache.get(src)
  if (cached) return Promise.resolve(cached)

  const pending = pendingLoads.get(src)
  if (pending) return pending

  const promise = new Promise<string>((resolve, reject) => {
    loadQueue.push(async () => {
      try {
        const token = getAuthToken()
        const response = await fetch(src, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
        if (!response.ok) {
          throw new Error(`Bild konnte nicht geladen werden (HTTP ${response.status}).`)
        }
        const blob = await response.blob()
        const objectUrl = URL.createObjectURL(blob)
        blobUrlCache.set(src, objectUrl)
        resolve(objectUrl)
      } catch (err) {
        reject(err)
      } finally {
        pendingLoads.delete(src)
        activeLoads--
        runNextQueued()
      }
    })
    runNextQueued()
  })

  pendingLoads.set(src, promise)
  return promise
}

export function AuthImage({ src, fallbackSrc, alt, ...rest }: AuthImageProps) {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => blobUrlCache.get(src) ?? null)
  const [isVisible, setIsVisible] = useState(false)
  const [useFallback, setUseFallback] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  const activeSrc = useFallback && fallbackSrc ? fallbackSrc : src
  // Neue, ausgelagerte Bilder brauchen Lazy-Loading + Auth-Header. Alte, noch eingebettete Data-URLs
  // können (und müssen) direkt angezeigt werden - sie sind bereits vollständig im Speicher.
  const needsAuthenticatedFetch = !activeSrc.startsWith('data:')

  useEffect(() => {
    setResolvedSrc(blobUrlCache.get(src) ?? null)
    setIsVisible(false)
    setUseFallback(false)
  }, [src])

  useEffect(() => {
    if (!needsAuthenticatedFetch || resolvedSrc) return
    const element = imgRef.current
    if (!element) return
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setIsVisible(true)
        observer.disconnect()
      }
    }, { rootMargin: '200px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [needsAuthenticatedFetch, resolvedSrc, activeSrc])

  useEffect(() => {
    if (!needsAuthenticatedFetch || !isVisible || resolvedSrc) return
    let cancelled = false
    loadAuthenticatedImage(activeSrc)
      .then(url => { if (!cancelled) setResolvedSrc(url) })
      .catch(() => {
        if (cancelled) return
        if (!useFallback && fallbackSrc && fallbackSrc !== activeSrc) {
          // Angefragtes Bild (z. B. Thumbnail) existiert nicht - auf das Vollbild ausweichen, statt
          // dauerhaft nur den Platzhalter anzuzeigen.
          setUseFallback(true)
        }
      })
    return () => { cancelled = true }
  }, [needsAuthenticatedFetch, isVisible, resolvedSrc, activeSrc, useFallback, fallbackSrc])

  const effectiveSrc = needsAuthenticatedFetch ? (resolvedSrc ?? undefined) : activeSrc

  return (
    <img
      ref={imgRef}
      src={effectiveSrc}
      alt={alt}
      {...rest}
      style={{ ...rest.style, opacity: effectiveSrc ? rest.style?.opacity ?? 1 : 0.35 }}
    />
  )
}
