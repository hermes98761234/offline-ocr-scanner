import { useEffect, useRef, useState } from 'react'
import type { T } from '../i18n'

interface Props {
  onShot: (blob: Blob) => void
  onClose: () => void
  /** Called when the camera cannot be opened, so the caller can fall back to the file picker. */
  onFallback: () => void
  t: T
}

export default function CameraDialog({ onShot, onClose, onFallback, t }: Props) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [count, setCount] = useState(0)

  useEffect(() => {
    let stream: MediaStream | null = null
    let live = true
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false })
      .then((s) => {
        if (!live) return s.getTracks().forEach((tr) => tr.stop())
        stream = s
        if (video.current) video.current.srcObject = s
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => {
      live = false
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  const shoot = () => {
    const v = video.current
    if (!v || !v.videoWidth) return
    const c = document.createElement('canvas')
    c.width = v.videoWidth
    c.height = v.videoHeight
    c.getContext('2d')!.drawImage(v, 0, 0)
    c.toBlob(
      (b) => {
        if (b) {
          onShot(b)
          setCount((n) => n + 1)
        }
      },
      'image/jpeg',
      0.95,
    )
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={t('Take a photo')}>
      <div className="modal-box">
        <h3>{t('Take a photo')}</h3>
        {error ? (
          <>
            <p className="err-text">{t('Camera is not available: {0}', error)}</p>
            <button onClick={onFallback}>{t('Use the file picker instead')}</button>
          </>
        ) : (
          <video ref={video} autoPlay playsInline muted />
        )}
        <div className="row">
          {!error && <button className="primary" onClick={shoot}>{t('Capture')}</button>}
          {count > 0 && <span className="hint">{t('{0} captured', count)}</span>}
          <span className="spacer" />
          <button onClick={onClose}>{count > 0 ? t('Done') : t('Close')}</button>
        </div>
      </div>
    </div>
  )
}
