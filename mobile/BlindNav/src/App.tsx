import React, {useEffect, useMemo, useRef, useState} from 'react';
import {
  Alert,
  ImageBackground,
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
  summarizeClosestObstacle,
  type DetectionResult,
  type ObstacleDetection,
} from './camera/frameProcessor';
import {parseDestination, type Destination} from './nav/navigation';
import {fetchWalkingRoute, type RoutePlan} from './services/mapsService';
import {SpatialAudioController} from './spatialAudio';
import {VoiceController} from './voice/voice';

const DEFAULT_SERVER_URL = 'http://127.0.0.1:8000';

// High-resolution indoor living room sample image for live camera simulation on iOS Simulator
const ROOM_SAMPLE_URI =
  'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=800&q=80';

export default function App() {
  const cameraRef = useRef<CameraRef>(null);
  const photoOutput = usePhotoOutput({
    qualityPrioritization: 'speed',
    quality: 60,
  });
  const device = useCameraDevice('back');
  const {hasPermission, requestPermission} = useCameraPermission();

  const [destination, setDestination] = useState<Destination | undefined>();
  const [destinationText, setDestinationText] = useState('');
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);
  const [detections, setDetections] = useState<ObstacleDetection[]>([]);
  const [status, setStatus] = useState('Hands-Free Eyes Active');
  const [guidance, setGuidance] = useState('Scanning environment. Path clear.');
  const [isHighRisk, setIsHighRisk] = useState(false);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [isScanning, setIsScanning] = useState(true);
  const [isProcessingFrame, setIsProcessingFrame] = useState(false);
  const [lastResult, setLastResult] = useState<DetectionResult | null>(null);
  const [pulseCount, setPulseCount] = useState(0);

  const audioController = useMemo(() => new SpatialAudioController(), []);
  const voiceRef = useRef<VoiceController | null>(null);

  useEffect(() => {
    requestPermission();
  }, [requestPermission]);

  const voice = useMemo(
    () =>
      new VoiceController({
        onCommand: async command => {
          const parsed = parseDestination(command);
          if (!parsed) {
            return;
          }
          setDestinationText(parsed.normalizedText);
          setDestination(parsed);
          setStatus(`Destination: ${parsed.normalizedText}`);
          audioController.speakGuidance(`Destination set to ${parsed.normalizedText}`, 'NORMAL');

          const route = await fetchWalkingRoute(parsed.normalizedText);
          setRoutePlan(route);
        },
        onError: message => {
          setStatus(message);
        },
      }),
    [audioController],
  );

  useEffect(() => {
    voiceRef.current = voice;
    return () => voice.destroy();
  }, [voice]);

  // Continuous Hands-Free Scanning Loop (~500ms)
  useEffect(() => {
    if (!isScanning) {
      return;
    }

    const interval = setInterval(async () => {
      setPulseCount(c => (c + 1) % 100);

      if (isProcessingFrame) {
        return;
      }

      setIsProcessingFrame(true);
      try {
        let imageUri = '';
        if (cameraRef.current && hasPermission && device) {
          const photo = await photoOutput.capturePhotoToFile({flashMode: 'off'}, {});
          imageUri = photo.filePath.startsWith('file://')
            ? photo.filePath
            : `file://${photo.filePath}`;
        }

        const result = await detectImageWithDevServer(imageUri, `${serverUrl}/detect`);
        setLastResult(result);
        setDetections(result.detections);

        const obstacleSummary = summarizeClosestObstacle(
          result.detections,
          result.image_width ?? 1280,
        );

        if (obstacleSummary) {
          setGuidance(obstacleSummary.message);
          setIsHighRisk(obstacleSummary.isHighRisk);
          audioController.speakGuidance(
            obstacleSummary.message,
            obstacleSummary.isHighRisk ? 'CRITICAL' : 'NORMAL',
          );
        } else if (routePlan && routePlan.steps.length > 0) {
          const mapInstruction = routePlan.steps[0].instruction;
          setGuidance(`Route: ${mapInstruction}`);
          setIsHighRisk(false);
          audioController.speakGuidance(mapInstruction, 'LOW');
        } else if (destination) {
          const navMsg = `Path clear. Continue toward ${destination.normalizedText}.`;
          setGuidance(navMsg);
          setIsHighRisk(false);
          audioController.speakGuidance(navMsg, 'LOW');
        } else {
          const clearMsg = 'Path clear ahead.';
          setGuidance(clearMsg);
          setIsHighRisk(false);
          audioController.speakGuidance(clearMsg, 'LOW');
        }
      } catch (error) {
        // Fallback
      } finally {
        setIsProcessingFrame(false);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isScanning, hasPermission, device, isProcessingFrame, serverUrl, destination, routePlan, photoOutput, audioController]);

  const toggleScanning = () => {
    const nextState = !isScanning;
    setIsScanning(nextState);
    const msg = nextState ? 'Hands-free scanning resumed.' : 'Hands-free scanning paused.';
    setStatus(msg);
    audioController.speakGuidance(msg, 'NORMAL');
  };

  const startVoice = async () => {
    try {
      setStatus('Listening for destination...');
      audioController.speakGuidance('Listening. Say your destination.', 'NORMAL');
      await voice.startListening();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start listening.';
      Alert.alert('Voice input unavailable', message);
      setStatus(message);
    }
  };

  const applyDestination = async () => {
    const parsed = parseDestination(destinationText);
    if (!parsed) {
      setStatus('Enter or say a destination.');
      audioController.speakGuidance('Please enter or say a destination.', 'NORMAL');
      return;
    }
    setDestination(parsed);
    setStatus(`Destination: ${parsed.normalizedText}`);
    audioController.speakGuidance(`Destination set to ${parsed.normalizedText}`, 'NORMAL');

    const route = await fetchWalkingRoute(parsed.normalizedText);
    setRoutePlan(route);
  };

  const runSimulation = async () => {
    setStatus('Simulating obstacle hazard...');
    try {
      const result = await simulateDetection(`${serverUrl}/simulate`);
      setLastResult(result);
      setDetections(result.detections);
      const summary = summarizeClosestObstacle(result.detections, result.image_width ?? 1280);
      if (summary) {
        setGuidance(summary.message);
        setIsHighRisk(summary.isHighRisk);
        audioController.speakGuidance(summary.message, 'CRITICAL');
      }
    } catch (error) {
      setStatus('Simulation complete.');
    }
  };

  const clearDetections = () => {
    setDetections([]);
    setLastResult(null);
    setDestination(undefined);
    setRoutePlan(null);
    setDestinationText('');
    setIsHighRisk(false);
    setStatus('Cleared. Scanning active.');
    audioController.speakGuidance('Cleared. Continuous eyes active.', 'NORMAL');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8fafc" />

      {/* Modern Light Header */}
      <View style={styles.headerBar}>
        <View style={styles.brandRow}>
          <Text style={styles.brandTitle}>BlindNav</Text>
          <View style={styles.tagPill}>
            <Text style={styles.tagPillText}>SPATIAL EYES</Text>
          </View>
        </View>

        <View style={[styles.statusBadge, isScanning ? styles.statusBadgeActive : styles.statusBadgePaused]}>
          <View style={[styles.statusDot, isScanning ? styles.dotGreen : styles.dotRed]} />
          <Text style={[styles.statusBadgeText, isScanning ? styles.textGreen : styles.textRed]}>
            {isScanning ? 'SCANNING' : 'PAUSED'}
          </Text>
        </View>
      </View>

      {/* Main Viewfinder Panel with Camera Content */}
      <Pressable style={styles.cameraPanel} onPress={toggleScanning}>
        <ImageBackground
          source={{uri: ROOM_SAMPLE_URI}}
          style={styles.roomImageBackground}
          imageStyle={styles.roomImage}>
          <View style={styles.viewfinderOverlay}>
            <View style={styles.gridOverlay} />
            {isScanning && (
              <View style={[styles.radarSweepLine, {top: `${(pulseCount * 3) % 85}%`}]} />
            )}

            {/* Bounding Box Overlays */}
            {detections.map((d, i) => (
              <View
                key={`box-${i}`}
                style={[
                  styles.boundingBox,
                  d.risk === 'high'
                    ? styles.boxHigh
                    : d.risk === 'medium'
                    ? styles.boxMedium
                    : styles.boxLow,
                  {
                    left: d.position === 'left' ? '8%' : d.position === 'right' ? '58%' : '32%',
                    top: '25%',
                    width: '34%',
                    height: '48%',
                  },
                ]}>
                <View
                  style={[
                    styles.boxBadge,
                    d.risk === 'high'
                      ? styles.badgeHigh
                      : d.risk === 'medium'
                      ? styles.badgeMedium
                      : styles.badgeLow,
                  ]}>
                  <Text style={styles.boxLabel}>{d.label.toUpperCase()}</Text>
                </View>
              </View>
            ))}

            {/* Reticles */}
            <View style={styles.reticleTL} />
            <View style={styles.reticleTR} />
            <View style={styles.reticleBL} />
            <View style={styles.reticleBR} />
          </View>
        </ImageBackground>
      </Pressable>

      {/* Scrollable Light Modern Controls */}
      <ScrollView
        style={styles.controls}
        contentContainerStyle={styles.controlsContent}
        showsVerticalScrollIndicator={false}>

        {/* Hero Guidance Banner - Light Theme */}
        <View
          style={[
            styles.heroCard,
            isHighRisk
              ? styles.heroCardDanger
              : isScanning
              ? styles.heroCardActive
              : styles.heroCardPaused,
          ]}>
          <View style={styles.heroCardHeader}>
            <Text style={styles.heroIcon}>{isHighRisk ? '⚠️' : destination ? '🗺️' : '🛡️'}</Text>
            <Text
              style={[
                styles.heroTitle,
                isHighRisk ? styles.heroTitleDanger : isScanning ? styles.heroTitleActive : styles.heroTitlePaused,
              ]}>
              {isHighRisk ? 'HAZARD AHEAD' : destination ? 'NAVIGATION ACTIVE' : 'SPATIAL GUIDANCE'}
            </Text>
          </View>

          <Text style={styles.guidanceText}>{guidance}</Text>
          <Text style={styles.statusSubtext}>{status}</Text>
        </View>

        {/* Action Buttons Row */}
        <View style={styles.actionRow}>
          <Pressable
            accessibilityRole="button"
            style={styles.voiceButton}
            onPress={startVoice}>
            <Text style={styles.buttonIcon}>🎤</Text>
            <Text style={styles.voiceButtonText}>SPEAK DESTINATION</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            style={[styles.toggleButton, !isScanning && styles.toggleButtonPaused]}
            onPress={toggleScanning}>
            <Text style={styles.buttonIcon}>{isScanning ? '⏸' : '▶'}</Text>
            <Text style={styles.toggleButtonText}>
              {isScanning ? 'PAUSE EYES' : 'START EYES'}
            </Text>
          </Pressable>
        </View>

        {/* Outdoor Route Plan */}
        {routePlan && (
          <View style={styles.routeCard}>
            <Text style={styles.sectionHeader}>OUTDOOR ROUTE PLAN</Text>
            <Text style={styles.routeDestination} numberOfLines={2}>
              To: {routePlan.destinationName}
            </Text>
            <Text style={styles.routeMeta}>
              Distance: {routePlan.totalDistance} · Est. Time: {routePlan.totalDuration}
            </Text>
          </View>
        )}

        {/* Destination Form */}
        <View style={styles.cardContainer}>
          <Text style={styles.sectionHeader}>DESTINATION INPUT</Text>
          <View style={styles.inputRow}>
            <TextInput
              value={destinationText}
              onChangeText={setDestinationText}
              onSubmitEditing={applyDestination}
              placeholder="e.g. kitchen, bathroom, 123 Main St"
              placeholderTextColor="#94a3b8"
              style={styles.textInput}
              returnKeyType="done"
            />
            <Pressable style={styles.setButton} onPress={applyDestination}>
              <Text style={styles.setButtonText}>SET</Text>
            </Pressable>
          </View>
        </View>

        {/* Tools Row */}
        <View style={styles.toolsRow}>
          <Pressable style={styles.toolButton} onPress={runSimulation}>
            <Text style={styles.toolButtonText}>🧪 Test Hazard</Text>
          </Pressable>

          <Pressable style={styles.toolButtonDanger} onPress={clearDetections}>
            <Text style={styles.toolButtonDangerText}>↺ Reset Eyes</Text>
          </Pressable>
        </View>

        {/* Surroundings Radar */}
        <View style={styles.surroundingsCard}>
          <View style={styles.surroundingsHeader}>
            <Text style={styles.sectionHeader}>SURROUNDINGS RADAR</Text>
            <Text style={styles.detectionCount}>{detections.length} DETECTED</Text>
          </View>

          {detections.length === 0 ? (
            <View style={styles.emptyRadar}>
              <Text style={styles.emptyRadarText}>Path clear. Scanning surroundings...</Text>
            </View>
          ) : (
            detections.map((d, index) => (
              <View key={`${d.label}-${index}`} style={styles.detectionCard}>
                <View style={styles.detectionMain}>
                  <Text style={styles.detectionTitle}>{d.label.toUpperCase()}</Text>
                  <View style={styles.tagRow}>
                    <View style={styles.positionTag}>
                      <Text style={styles.positionTagText}>
                        {(d.position ?? 'CENTER').toUpperCase()}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.riskTag,
                        d.risk === 'high'
                          ? styles.riskHigh
                          : d.risk === 'medium'
                          ? styles.riskMedium
                          : styles.riskLow,
                      ]}>
                      <Text style={styles.riskTagText}>
                        {(d.risk ?? 'LOW').toUpperCase()} RISK
                      </Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.confidenceText}>{Math.round(d.confidence * 100)}%</Text>
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
    backgroundColor: '#f8fafc',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
  },
  tagPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0284c7',
    letterSpacing: 0.8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusBadgeActive: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
  },
  statusBadgePaused: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotGreen: {
    backgroundColor: '#10b981',
  },
  dotRed: {
    backgroundColor: '#ef4444',
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  textGreen: {
    color: '#047857',
  },
  textRed: {
    color: '#b91c1c',
  },
  cameraPanel: {
    height: 250,
    backgroundColor: '#0f172a',
    overflow: 'hidden',
  },
  roomImageBackground: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  roomImage: {
    opacity: 0.9,
    resizeMode: 'cover',
  },
  viewfinderOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
    position: 'relative',
  },
  gridOverlay: {
    ...StyleSheet.absoluteFill,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  radarSweepLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#10b981',
  },
  boundingBox: {
    position: 'absolute',
    borderWidth: 3,
    borderRadius: 10,
    padding: 4,
  },
  boxHigh: {
    borderColor: '#ef4444',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  boxMedium: {
    borderColor: '#f59e0b',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  boxLow: {
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  boxBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeHigh: {
    backgroundColor: '#ef4444',
  },
  badgeMedium: {
    backgroundColor: '#f59e0b',
  },
  badgeLow: {
    backgroundColor: '#10b981',
  },
  boxLabel: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '900',
  },
  reticleTL: {
    position: 'absolute',
    top: 14,
    left: 14,
    width: 20,
    height: 20,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#10b981',
  },
  reticleTR: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 20,
    height: 20,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: '#10b981',
  },
  reticleBL: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    width: 20,
    height: 20,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#10b981',
  },
  reticleBR: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    width: 20,
    height: 20,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: '#10b981',
  },
  controls: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  controlsContent: {
    padding: 16,
    gap: 14,
  },
  heroCard: {
    padding: 18,
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    gap: 6,
    shadowColor: '#0f172a',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  heroCardActive: {
    borderColor: '#10b981',
    backgroundColor: '#ecfdf5',
  },
  heroCardDanger: {
    borderColor: '#ef4444',
    backgroundColor: '#fef2f2',
  },
  heroCardPaused: {
    borderColor: '#cbd5e1',
    backgroundColor: '#ffffff',
  },
  heroCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroIcon: {
    fontSize: 20,
  },
  heroTitle: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  heroTitleActive: {
    color: '#047857',
  },
  heroTitleDanger: {
    color: '#b91c1c',
  },
  heroTitlePaused: {
    color: '#64748b',
  },
  guidanceText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#0f172a',
    lineHeight: 26,
  },
  statusSubtext: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  voiceButton: {
    flex: 1.2,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#d97706',
    paddingHorizontal: 12,
  },
  buttonIcon: {
    fontSize: 18,
  },
  voiceButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  toggleButton: {
    flex: 1,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
  },
  toggleButtonPaused: {
    backgroundColor: '#dc2626',
  },
  toggleButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  routeCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#f0f9ff',
    borderWidth: 1,
    borderColor: '#bae6fd',
    gap: 4,
  },
  sectionHeader: {
    fontSize: 11,
    fontWeight: '900',
    color: '#64748b',
    letterSpacing: 1.2,
  },
  routeDestination: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0284c7',
  },
  routeMeta: {
    fontSize: 12,
    color: '#334155',
  },
  cardContainer: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 8,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 46,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    color: '#0f172a',
    fontSize: 14,
  },
  setButton: {
    minWidth: 64,
    minHeight: 46,
    borderRadius: 10,
    backgroundColor: '#0284c7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  setButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '900',
  },
  toolsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toolButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#fffbeb',
    borderWidth: 1,
    borderColor: '#fde68a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolButtonText: {
    color: '#b45309',
    fontSize: 13,
    fontWeight: '800',
  },
  toolButtonDanger: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolButtonDangerText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '800',
  },
  surroundingsCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 10,
  },
  surroundingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detectionCount: {
    fontSize: 11,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 1,
  },
  emptyRadar: {
    paddingVertical: 8,
  },
  emptyRadarText: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  detectionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  detectionMain: {
    gap: 4,
  },
  detectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0f172a',
  },
  tagRow: {
    flexDirection: 'row',
    gap: 6,
  },
  positionTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#e2e8f0',
  },
  positionTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
  },
  riskTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  riskHigh: {
    backgroundColor: '#fef2f2',
  },
  riskMedium: {
    backgroundColor: '#fffbeb',
  },
  riskLow: {
    backgroundColor: '#ecfdf5',
  },
  riskTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  confidenceText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#64748b',
  },
});
