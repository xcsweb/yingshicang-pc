import React, { useMemo, useState } from 'react'
export type SmartImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string | null
  fallbackText?: string
  fallbackSrc?: string
}

const escapeXml = (v: string): string =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&apos;')

const createSvgFallback = (text: string): string => {
  const t = escapeXml((text || '无封面').slice(0, 16))
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#f3f4f6"/><stop offset="1" stop-color="#e5e7eb"/></linearGradient></defs>` +
    `<rect width="600" height="800" fill="url(#g)"/>` +
    `<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="42" fill="#9ca3af" font-family="system-ui, -apple-system, Segoe UI, Roboto, sans-serif">` +
    `${t}</text></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const SmartImage: React.FC<SmartImageProps> = ({ src, fallbackText, fallbackSrc, loading, decoding, ...rest }) => {
  const [broken, setBroken] = useState(false)
  const safeSrc = (src || '').trim()
  const computedFallback = useMemo(() => fallbackSrc || createSvgFallback(fallbackText || '无封面'), [fallbackSrc, fallbackText])
  const resolved = broken || !safeSrc ? computedFallback : safeSrc

  return (
    <img
      {...rest}
      src={resolved}
      referrerPolicy="no-referrer"
      loading={loading || 'lazy'}
      decoding={decoding || 'async'}
      onError={(e) => {
        if (!broken) setBroken(true)
        rest.onError?.(e)
      }}
    />
  )
}

export default SmartImage
