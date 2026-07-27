import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Camera,
  type CameraRef,
  usePhotoOutput,
  useCameraDevice,
  useCameraPermission,
} from 'react-native-vision-camera';

import {
  detectImageWithDevServer,
  simulateDetection,
  type DetectionResult,
  type ObstacleDetection,
} from './camera/frameProcessor';
import {getNavigationMessage, parseDestination, type Destination} from './nav/navigation';
import {VoiceController} from './voice/voice';

const DEFAULT_SERVER_URL = 'http://127.0.0.1:8000';

export default function App() {
  const cameraRef = useRef<CameraRef>(null);
  const photoOutput = usePhotoOutput({
    qualityPrioritization: 'speed',
    quality: 75,
  });
  const device = useCameraDevice('back');
  const {hasPermission, requestPermission} = useCameraPermission();
  const [destination, setDestination] = useState<Destination | undefined>();
  const [destinationText, setDestinationText] = useState('');
  const [detections, setDetections] = useState<ObstacleDetection[]>([]);
  const [status, setStatus] = useState('Ready');
  const [guidance, setGuidance] = useState('Say a destination to begin.');
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<DetectionResult | null>(null);
  const voiceRef = useRef<VoiceController | null>(null);

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  const voice = useMemo(
    () =>
      new VoiceController({
        onCommand: command => {
          const parsed = parseDestination(command);
          if (!parsed) {
            return;
          }
          setDestinationText(parsed.normalizedText);
          setDestination(parsed);
          setStatus(`Destination: ${parsed.normalizedText}`);
        },
        onError: message => setStatus(message),
      }),
    [],
  );

  useEffect(() => {
    voiceRef.current = voice;
    return () => voice.destroy();
  }, [voice]);

  useEffect(() => {
    const message = getNavigationMessage({
      destination,
      detections,
      frameWidth: lastResult?.image_width ?? 1280,
      serverGuidance: lastResult?.guidance,
    });
    setGuidance(message);
    voiceRef.current?.speak(message);
  }, [destination, detections, lastResult]);

  const applyDestination = () => {
    const parsed = parseDestination(destinationText);
    if (!parsed) {
      setStatus('Enter or say a destination.');
      return;
    }
    setDestination(parsed);
    setStatus(`Destination: ${parsed.normalizedText}`);
  };

  const startVoice = async () => {
    try {
      setStatus('Listening...');
      await voice.startListening();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start listening.';
      Alert.alert('Voice input unavailable', message);
      setStatus(message);
    }
  };

  const applyDetectionResult = (result: DetectionResult, nextStatus: string) => {
    setLastResult(result);
    setDetections(result.detections);
    setStatus(nextStatus);
  };

  const analyzeFrame = async () => {
    if (!cameraRef.current) {
      setStatus('Camera is not ready yet.');
      return;
    }

    setIsAnalyzing(true);
    setStatus('Analyzing camera frame...');

    try {
      const photo = await photoOutput.capturePhotoToFile({flashMode: 'off'}, {});
      const imageUri = photo.filePath.startsWith('file://')
        ? photo.filePath
        : `file://${photo.filePath}`;
      const result = await detectImageWithDevServer(imageUri, `${serverUrl}/detect`);
      applyDetectionResult(result, `Detected ${result.detections.length} obstacle(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Frame analysis failed.';
      Alert.alert('Detection failed', message);
      setStatus(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const runSimulation = async () => {
    setIsAnalyzing(true);
    setStatus('Running simulated obstacle...');

    try {
      const result = await simulateDetection(`${serverUrl}/simulate`);
      applyDetectionResult(result, 'Loaded simulated obstacle.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Simulation failed.';
      Alert.alert('Simulation failed', message);
      setStatus(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const clearDetections = () => {
    setDetections([]);
    setLastResult(null);
    setStatus('Detections cleared.');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.cameraPanel}>
        {device && hasPermission ? (
          <Camera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive
            outputs={[photoOutput]}
          />
        ) : (
          <View style={styles.emptyCamera}>
            <Text style={styles.emptyText}>Camera permission needed</Text>
          </View>
        )}
      </View>

      <ScrollView style={styles.controls} contentContainerStyle={styles.controlsContent}>
        <Text style={styles.guidance}>{guidance}</Text>
        <Text style={styles.status}>{status}</Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>Destination</Text>
          <TextInput
            accessibilityLabel="Destination"
            value={destinationText}
            onChangeText={setDestinationText}
            onSubmitEditing={applyDestination}
            placeholder="e.g. front door"
            placeholderTextColor="#7d9188"
            style={styles.input}
            returnKeyType="done"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>ML server</Text>
          <TextInput
            accessibilityLabel="ML server URL"
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={DEFAULT_SERVER_URL}
            placeholderTextColor="#7d9188"
            style={styles.input}
          />
        </View>

        <View style={styles.buttonRow}>
          <Pressable accessibilityRole="button" style={styles.button} onPress={applyDestination}>
            <Text style={styles.buttonText}>Set</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.button} onPress={startVoice}>
            <Text style={styles.buttonText}>Listen</Text>
          </Pressable>
        </View>

        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            disabled={isAnalyzing}
            style={[styles.button, isAnalyzing && styles.buttonDisabled]}
            onPress={analyzeFrame}>
            <Text style={styles.buttonText}>Analyze</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={isAnalyzing}
            style={[styles.secondaryButton, isAnalyzing && styles.buttonDisabled]}
            onPress={runSimulation}>
            <Text style={styles.secondaryButtonText}>Simulate</Text>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button" style={styles.ghostButton} onPress={clearDetections}>
          <Text style={styles.ghostButtonText}>Clear detections</Text>
        </Pressable>

        <View style={styles.detectionPanel}>
          <Text style={styles.panelTitle}>Obstacles</Text>
          {detections.length === 0 ? (
            <Text style={styles.emptyList}>No obstacles detected.</Text>
          ) : (
            detections.map((detection, index) => (
              <View key={`${detection.label}-${index}`} style={styles.detectionRow}>
                <Text style={styles.detectionLabel}>{detection.label}</Text>
                <Text style={styles.detectionMeta}>
                  {Math.round(detection.confidence * 100)}% · {detection.position ?? 'unknown'} ·{' '}
                  {detection.risk ?? 'low'}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#101412',
  },
  cameraPanel: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#1c2521',
  },
  emptyCamera: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#d8eee4',
    fontSize: 18,
    fontWeight: '600',
  },
  controls: {
    backgroundColor: '#18211d',
    maxHeight: 390,
  },
  controlsContent: {
    gap: 12,
    padding: 20,
  },
  guidance: {
    color: '#ffffff',
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
  status: {
    color: '#b8cec4',
    fontSize: 15,
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    color: '#d8eee4',
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: '#3d5047',
    borderRadius: 8,
    paddingHorizontal: 12,
    color: '#ffffff',
    backgroundColor: '#101713',
    fontSize: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#f4c95d',
  },
  buttonText: {
    color: '#111111',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#8bd7c4',
  },
  secondaryButtonText: {
    color: '#111111',
    fontSize: 17,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  ghostButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3d5047',
  },
  ghostButtonText: {
    color: '#d8eee4',
    fontSize: 15,
    fontWeight: '700',
  },
  detectionPanel: {
    gap: 10,
    paddingTop: 6,
  },
  panelTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  emptyList: {
    color: '#b8cec4',
    fontSize: 15,
  },
  detectionRow: {
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#304239',
  },
  detectionLabel: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  detectionMeta: {
    color: '#b8cec4',
    fontSize: 14,
  },
});
