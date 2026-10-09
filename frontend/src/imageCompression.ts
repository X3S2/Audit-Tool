export interface CompressionOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  maxSizeKB?: number
}

export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<Blob> {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.8,
    maxSizeKB = 5000
  } = options

  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      const img = new Image()

      img.onload = () => {
        const canvas = document.createElement('canvas')
        let { width, height } = img

        if (width > maxWidth || height > maxHeight) {
          const aspectRatio = width / height

          if (width > height) {
            width = Math.min(width, maxWidth)
            height = width / aspectRatio
          } else {
            height = Math.min(height, maxHeight)
            width = height * aspectRatio
          }
        }

        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Canvas context not available'))
          return
        }

        ctx.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Compression failed'))
              return
            }

            const sizeKB = blob.size / 1024
            if (sizeKB > maxSizeKB) {
              let currentQuality = quality
              let attemptCount = 0
              const maxAttempts = 5

              const reduceQuality = () => {
                attemptCount++
                currentQuality -= 0.1

                if (currentQuality < 0.1 || attemptCount >= maxAttempts) {
                  resolve(blob)
                  return
                }

                canvas.toBlob(
                  (newBlob) => {
                    if (!newBlob || newBlob.size / 1024 <= maxSizeKB) {
                      resolve(newBlob || blob)
                    } else {
                      reduceQuality()
                    }
                  },
                  'image/jpeg',
                  currentQuality
                )
              }

              reduceQuality()
            } else {
              resolve(blob)
            }
          },
          'image/jpeg',
          quality
        )
      }

      img.onerror = () => {
        reject(new Error('Failed to load image'))
      }

      img.src = event.target?.result as string
    }

    reader.onerror = () => {
      reject(new Error('Failed to read file'))
    }

    reader.readAsDataURL(file)
  })
}

export function getCompressedFileName(originalName: string): string {
  const date = new Date()
  const timestamp = date.toISOString().replace(/[:.]/g, '').split('T')[0] + '_' + date.toISOString().split('T')[1].split('.')[0].replace(/:/g, '')
  const ext = originalName.split('.').pop() || 'jpg'
  return `${timestamp}_${originalName.replace(/\.[^/.]+$/, '')}.${ext}`
}
