import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'

import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { ThemedText } from '@/components/themed-text'
import { ThemedView } from '@/components/themed-view'
import { IconSymbol } from '@/components/ui/icon-symbol'
import { useThemeColor } from '@/hooks/use-theme-color'

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions()
  const [facing, setFacing] = useState<CameraType>('back')
  const [isTakingPhoto, setIsTakingPhoto] = useState(false)
  const [isCaptured, setIsCaptured] = useState(false)
  const [lastPhotoUri, setLastPhotoUri] = useState<string | null>(null)
  const cameraRef = useRef<CameraView>(null)
  const router = useRouter()
  const insets = useSafeAreaInsets()

  const textColor = useThemeColor({}, 'text')
  const tintColor = useThemeColor({}, 'tint')
  const processTextColor = useThemeColor(
    { light: '#fff', dark: '#11181C' },
    'text',
  )
  const controlBackground = useThemeColor(
    { light: 'rgba(255, 255, 255, 0.8)', dark: 'rgba(21, 23, 24, 0.8)' },
    'background',
  )

  const handleToggleFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'))
  }

  const handleCapture = async () => {
    if (!cameraRef.current || isTakingPhoto) {
      return
    }

    try {
      setIsTakingPhoto(true)
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.8 })

      if (photo?.uri) {
        setLastPhotoUri(photo.uri)
        setIsCaptured(true)
        await cameraRef.current.pausePreview()
      }
    } catch (error) {
      console.error('Failed to take picture', error)
    } finally {
      setIsTakingPhoto(false)
    }
  }

  const handleRetake = async () => {
    setIsCaptured(false)
    setLastPhotoUri(null)

    try {
      await cameraRef.current?.resumePreview()
    } catch (error) {
      console.error('Failed to resume camera preview', error)
    }
  }

  const handleProcess = () => {
    if (!lastPhotoUri) {
      return
    }

    router.push({ pathname: '/process', params: { uri: lastPhotoUri } })
  }

  if (!permission) {
    return (
      <ThemedView style={styles.permissionContainer}>
        <ThemedText type="subtitle">Loading camera...</ThemedText>
      </ThemedView>
    )
  }

  if (!permission.granted) {
    return (
      <ThemedView style={styles.permissionContainer}>
        <ThemedText type="title">Camera access needed</ThemedText>
        <ThemedText style={styles.permissionText}>
          Allow camera access to capture a palette from a photo.
        </ThemedText>
        <Pressable style={styles.permissionButton} onPress={requestPermission}>
          <ThemedText type="defaultSemiBold">Grant access</ThemedText>
        </Pressable>
      </ThemedView>
    )
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} facing={facing} style={styles.camera} />
      <View
        style={[
          styles.overlay,
          {
            paddingTop: 20 + insets.top,
            paddingBottom: 32 + insets.bottom,
          },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.helperContainer}>
          <ThemedText
            style={[styles.helperText, { color: textColor }]}
            type="defaultSemiBold"
          >
            {isCaptured
              ? 'Review the shot and process the palette'
              : 'Point at a surface and tap the shutter'}
          </ThemedText>
        </View>
        {isCaptured ? (
          <View style={styles.actions}>
            <Pressable
              style={[
                styles.actionButton,
                { backgroundColor: controlBackground },
              ]}
              onPress={handleRetake}
            >
              <ThemedText type="defaultSemiBold">Retake</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.actionButton, { backgroundColor: tintColor }]}
              onPress={handleProcess}
            >
              <ThemedText
                type="defaultSemiBold"
                style={[styles.actionPrimaryText, { color: processTextColor }]}
              >
                Process
              </ThemedText>
            </Pressable>
          </View>
        ) : (
          <View style={styles.controls}>
            <Pressable
              style={[
                styles.controlButton,
                { backgroundColor: controlBackground },
              ]}
              onPress={handleToggleFacing}
            >
              <IconSymbol name="camera.rotate" size={22} color={textColor} />
            </Pressable>
            <Pressable
              style={styles.shutterButton}
              onPress={handleCapture}
              disabled={isTakingPhoto}
            >
              <View
                style={[
                  styles.shutterInner,
                  isTakingPhoto && styles.shutterInnerDisabled,
                ]}
              />
            </Pressable>
            <View style={styles.previewSlot}>
              {lastPhotoUri ? (
                <Image
                  source={{ uri: lastPhotoUri }}
                  style={styles.previewImage}
                />
              ) : (
                <View
                  style={[styles.previewImage, styles.previewPlaceholder]}
                />
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 20,
  },
  helperContainer: {
    alignItems: 'center',
  },
  helperText: {
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderRadius: 16,
    overflow: 'hidden',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimaryText: {},
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterButton: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fff',
  },
  shutterInnerDisabled: {
    opacity: 0.6,
  },
  previewSlot: {
    width: 44,
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewPlaceholder: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  permissionText: {
    textAlign: 'center',
    opacity: 0.8,
  },
  permissionButton: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
})
