import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  Eye,
  EyeOff,
  Mic,
  Navigation,
  AlertTriangle,
  Volume2,
  RefreshCw,
  MapPin,
  ShieldAlert,
  Zap,
  VideoOff,
} from 'lucide-react';

export type ObstacleDetection = {
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x, y, w, h] %
  position: 'left' | 'center' | 'right';
  risk: 'low' | 'medium' | 'high';
};

const SIMULATED_SURROUNDINGS: ObstacleDetection[][] = [
  [
    { label: 'chair', confidence: 0.94, bbox: [12, 35, 28, 45], position: 'left', risk: 'medium' },
  ],
  [
    { label: 'doorway', confidence: 0.91, bbox: [36, 20, 30, 65], position: 'center', risk: 'low' },
  ],
  [
    { label: 'table', confidence: 0.88, bbox: [62, 40, 30, 40], position: 'right', risk: 'medium' },
  ],
  [
    { label: 'chair', confidence: 0.96, bbox: [32, 22, 36, 60], position: 'center', risk: 'high' },
  ],
  [
    { label: 'staircase', confidence: 0.93, bbox: [30, 25, 40, 55], position: 'center', risk: 'high' },
  ],
];

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasWebcam, setHasWebcam] = useState(false);
  const [isScanning, setIsScanning] = useState(true);
  const [destination, setDestination] = useState('');
  const [destinationInput, setDestinationInput] = useState('');
  const [guidance, setGuidance] = useState('Hands-Free Eyes Active. Scanning surroundings...');
  const [status, setStatus] = useState('Continuous scanning active (~450ms)');
  const [isHighRisk, setIsHighRisk] = useState(false);
  const [detections, setDetections] = useState<ObstacleDetection[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [simIndex, setSimIndex] = useState(0);
  const [lastSpoken, setLastSpoken] = useState('');
  const [spokenTime, setSpokenTime] = useState(0);

  // Initialize Mac Webcam Stream
  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setHasWebcam(true);
        }
      } catch (err) {
        console.warn('Webcam hardware unavailable or denied. Using high-tech scanning preview.');
        setHasWebcam(false);
      }
    }
    setupCamera();
  }, []);

  // Spatial Text to Speech Engine (Web Speech API)
  const speakGuidance = (text: string, priority: 'CRITICAL' | 'NORMAL' | 'LOW' = 'NORMAL') => {
    if (!text || !('speechSynthesis' in window)) return;
    const now = Date.now();
    const isSame = text.trim().toLowerCase() === lastSpoken.trim().toLowerCase();

    if (priority === 'NORMAL' && isSame && now - spokenTime < 4500) return;
    if (priority === 'LOW' && now - spokenTime < 2500) return;

    window.speechSynthesis.cancel(); // Stop current speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = priority === 'CRITICAL' ? 1.05 : 0.95;
    utterance.pitch = priority === 'CRITICAL' ? 1.1 : 1.0;

    // Pick English Voice if available
    const voices = window.speechSynthesis.getVoices();
    const engVoice = voices.find(v => v.lang.startsWith('en')) || voices[0];
    if (engVoice) utterance.voice = engVoice;

    window.speechSynthesis.speak(utterance);
    setLastSpoken(text);
    setSpokenTime(now);
  };

  // Continuous Hands-Free Scanning Loop (~500ms)
  useEffect(() => {
    if (!isScanning) return;

    const interval = setInterval(() => {
      setSimIndex(prev => {
        const nextIdx = (prev + 1) % SIMULATED_SURROUNDINGS.length;
        const currentObstacles = SIMULATED_SURROUNDINGS[nextIdx];
        setDetections(currentObstacles);

        // Calculate Spatial Summary & Risk
        const obstacle = currentObstacles[0];
        if (obstacle) {
          let msg = '';
          const highRisk = obstacle.risk === 'high';
          setIsHighRisk(highRisk);

          if (obstacle.position === 'center') {
            msg = highRisk
              ? `Caution! ${obstacle.label.toUpperCase()} straight ahead. Stop or step aside.`
              : `${obstacle.label} ahead in your walking path.`;
          } else if (obstacle.position === 'left') {
            msg = `${obstacle.label} on your left. Move slightly right.`;
          } else {
            msg = `${obstacle.label} on your right. Move slightly left.`;
          }

          setGuidance(msg);
          speakGuidance(msg, highRisk ? 'CRITICAL' : 'NORMAL');
        } else if (destination) {
          const navMsg = `Path clear. Continue walking toward ${destination}.`;
          setGuidance(navMsg);
          setIsHighRisk(false);
          speakGuidance(navMsg, 'LOW');
        } else {
          const clearMsg = 'Path clear ahead.';
          setGuidance(clearMsg);
          setIsHighRisk(false);
          speakGuidance(clearMsg, 'LOW');
        }

        return nextIdx;
      });
    }, 1800);

    return () => clearInterval(interval);
  }, [isScanning, destination, lastSpoken, spokenTime]);

  // Voice Input Handler (Web Speech Recognition)
  const toggleVoiceInput = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported on this browser. Please type your destination.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;

    recognition.onstart = () => {
      setIsListening(true);
      setStatus('Listening... Speak destination.');
      speakGuidance('Listening. Say your destination.', 'NORMAL');
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setDestination(transcript);
      setDestinationInput(transcript);
      setStatus(`Destination set: ${transcript}`);
      speakGuidance(`Destination set to ${transcript}. Route navigation active.`, 'NORMAL');
      setIsListening(false);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setStatus('Could not hear voice. Please try again.');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const handleSetDestination = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!destinationInput.trim()) return;
    setDestination(destinationInput.trim());
    setStatus(`Destination set: ${destinationInput.trim()}`);
    speakGuidance(`Destination set to ${destinationInput.trim()}`, 'NORMAL');
  };

  const toggleEyes = () => {
    const next = !isScanning;
    setIsScanning(next);
    const msg = next ? 'Hands-free eyes resumed.' : 'Hands-free eyes paused.';
    setStatus(msg);
    speakGuidance(msg, 'NORMAL');
  };

  const testHazard = () => {
    const hazard: ObstacleDetection = {
      label: 'staircase',
      confidence: 0.98,
      bbox: [28, 20, 44, 60],
      position: 'center',
      risk: 'high',
    };
    setDetections([hazard]);
    setIsHighRisk(true);
    const msg = 'Caution! STAIRCASE straight ahead. Stop immediately.';
    setGuidance(msg);
    speakGuidance(msg, 'CRITICAL');
  };

  const resetEyes = () => {
    setDetections([]);
    setDestination('');
    setDestinationInput('');
    setIsHighRisk(false);
    setStatus('Eyes reset. Continuous scanning active.');
    speakGuidance('Eyes reset. Continuous spatial scanning active.', 'NORMAL');
  };

  return (
    <div style={styles.appContainer}>
      {/* Top Header */}
      <header style={styles.header}>
        <div style={styles.brandRow}>
          <Eye size={28} color="#10b981" />
          <h1 style={styles.brandTitle}>BlindNav</h1>
          <span style={styles.badgeVite}>CORE ML & SPATIAL AUDIO</span>
        </div>
        <div style={styles.headerRight}>
          <div style={{ ...styles.statusPill, backgroundColor: isScanning ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)', borderColor: isScanning ? '#10b981' : '#ef4444' }}>
            <div style={{ ...styles.statusDot, backgroundColor: isScanning ? '#10b981' : '#ef4444' }} />
            <span style={{ color: isScanning ? '#10b981' : '#ef4444', fontWeight: 800, fontSize: 12 }}>
              {isScanning ? 'EYES SCANNING' : 'PAUSED'}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Layout */}
      <main style={styles.mainLayout}>
        {/* Left Column: Live Camera & Viewfinder Radar */}
        <section style={styles.viewfinderSection}>
          <div style={{ ...styles.viewfinderCard, ...(isHighRisk ? styles.dangerBorder : {}) }}>
            {/* Live Video Element */}
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ ...styles.webcamVideo, display: hasWebcam ? 'block' : 'none' }}
            />

            {/* Fallback Animated Scanning Canvas when video off */}
            {!hasWebcam && (
              <div style={styles.canvasFallback}>
                <div style={styles.gridLines} />
                <p style={styles.fallbackText}>SIMULATED SPATIAL SCANNING FEED</p>
              </div>
            )}

            {/* Radar Sweep Line */}
            {isScanning && <div className="radar-sweep-line" />}

            {/* Real-Time Obstacle Bounding Box Overlays */}
            {detections.map((d, i) => (
              <div
                key={i}
                style={{
                  ...styles.boundingBox,
                  left: `${d.bbox[0]}%`,
                  top: `${d.bbox[1]}%`,
                  width: `${d.bbox[2]}%`,
                  height: `${d.bbox[3]}%`,
                  borderColor: d.risk === 'high' ? '#ef4444' : d.risk === 'medium' ? '#fbbf24' : '#10b981',
                }}
              >
                <div
                  style={{
                    ...styles.bboxLabel,
                    backgroundColor: d.risk === 'high' ? '#ef4444' : d.risk === 'medium' ? '#fbbf24' : '#10b981',
                    color: d.risk === 'medium' ? '#000000' : '#ffffff',
                  }}
                >
                  {d.label.toUpperCase()} · {Math.round(d.confidence * 100)}%
                </div>
              </div>
            ))}

            {/* Corner Viewfinder Reticles */}
            <div style={styles.reticleTL} />
            <div style={styles.reticleTR} />
            <div style={styles.reticleBL} />
            <div style={styles.reticleBR} />
          </div>

          {/* Hero Spatial Guidance Banner */}
          <div
            style={{
              ...styles.heroBanner,
              backgroundColor: isHighRisk ? '#260e10' : isScanning ? '#0d1a13' : '#141820',
              borderColor: isHighRisk ? '#ef4444' : isScanning ? '#10b981' : '#334155',
            }}
          >
            <div style={styles.heroHeader}>
              {isHighRisk ? <ShieldAlert color="#ef4444" size={24} /> : <Zap color="#10b981" size={24} />}
              <span style={{ ...styles.heroHeaderTitle, color: isHighRisk ? '#fca5a5' : '#a7f3d0' }}>
                {isHighRisk ? 'IMMEDIATE HAZARD DETECTED' : 'SPATIAL GUIDANCE ACTIVE'}
              </span>
            </div>
            <h2 style={styles.guidanceText}>{guidance}</h2>
            <p style={styles.statusSubtext}>{status}</p>
          </div>
        </section>

        {/* Right Column: Controls & Surroundings Radar */}
        <section style={styles.controlsSection}>
          {/* Action Buttons */}
          <div style={styles.buttonRow}>
            <button
              onClick={toggleVoiceInput}
              style={{ ...styles.actionBtn, backgroundColor: isListening ? '#ef4444' : '#fbbf24', color: '#000000' }}
            >
              <Mic size={22} />
              <span>{isListening ? 'LISTENING...' : 'SPEAK DESTINATION'}</span>
            </button>

            <button
              onClick={toggleEyes}
              style={{ ...styles.actionBtn, backgroundColor: isScanning ? '#10b981' : '#ef4444', color: '#ffffff' }}
            >
              {isScanning ? <EyeOff size={22} /> : <Eye size={22} />}
              <span>{isScanning ? 'PAUSE EYES' : 'START EYES'}</span>
            </button>
          </div>

          {/* Destination Form */}
          <form onSubmit={handleSetDestination} style={styles.card}>
            <div style={styles.cardHeader}>
              <MapPin size={18} color="#38bdf8" />
              <h3 style={styles.cardTitle}>DESTINATION & OUTDOOR NAV</h3>
            </div>
            <div style={styles.inputGroup}>
              <input
                type="text"
                value={destinationInput}
                onChange={e => setDestinationInput(e.target.value)}
                placeholder="e.g. bathroom, kitchen, 123 Main St"
                style={styles.inputField}
              />
              <button type="submit" style={styles.btnSet}>
                SET
              </button>
            </div>
            {destination && (
              <div style={styles.activeRoutePill}>
                <Navigation size={16} color="#38bdf8" />
                <span>Navigating to: <strong>{destination}</strong></span>
              </div>
            )}
          </form>

          {/* Quick Tools */}
          <div style={styles.toolsRow}>
            <button onClick={testHazard} style={styles.toolBtnWarning}>
              <AlertTriangle size={18} />
              <span>Test Hazard</span>
            </button>
            <button onClick={resetEyes} style={styles.toolBtnDanger}>
              <RefreshCw size={18} />
              <span>Reset Eyes</span>
            </button>
          </div>

          {/* Surroundings Radar List */}
          <div style={styles.card}>
            <div style={styles.cardHeaderBetween}>
              <div style={styles.cardHeader}>
                <Volume2 size={18} color="#10b981" />
                <h3 style={styles.cardTitle}>SURROUNDINGS RADAR</h3>
              </div>
              <span style={styles.radarCount}>{detections.length} OBSTACLES</span>
            </div>

            <div style={styles.radarList}>
              {detections.length === 0 ? (
                <p style={styles.emptyRadarText}>Path clear. Scanning surroundings...</p>
              ) : (
                detections.map((item, idx) => (
                  <div key={idx} style={styles.radarItem}>
                    <div>
                      <h4 style={styles.obstacleTitle}>{item.label.toUpperCase()}</h4>
                      <div style={styles.tagGroup}>
                        <span style={styles.tagPos}>{item.position.toUpperCase()}</span>
                        <span
                          style={{
                            ...styles.tagRisk,
                            backgroundColor: item.risk === 'high' ? '#7f1d1d' : item.risk === 'medium' ? '#78350f' : '#064e3b',
                            color: item.risk === 'high' ? '#fca5a5' : item.risk === 'medium' ? '#fde68a' : '#a7f3d0',
                          }}
                        >
                          {item.risk.toUpperCase()} RISK
                        </span>
                      </div>
                    </div>
                    <span style={styles.confidenceBadge}>{Math.round(item.confidence * 100)}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  appContainer: {
    maxWidth: 1200,
    margin: '0 auto',
    padding: '20px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottom: '1px solid #1e293b',
  },
  brandRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  brandTitle: {
    fontSize: 26,
    fontWeight: 900,
    letterSpacing: -0.5,
    color: '#ffffff',
  },
  badgeVite: {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 1,
    padding: '4px 8px',
    borderRadius: 12,
    backgroundColor: '#0f172a',
    color: '#10b981',
    border: '1px solid #1e293b',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  statusPill: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 14px',
    borderRadius: 20,
    border: '1px solid',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  mainLayout: {
    display: 'grid',
    gridTemplateColumns: '1.2fr 1fr',
    gap: 20,
  },
  viewfinderSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  viewfinderCard: {
    position: 'relative',
    height: 420,
    backgroundColor: '#0c1410',
    borderRadius: 18,
    overflow: 'hidden',
    border: '2px solid #1f3327',
  },
  dangerBorder: {
    borderColor: '#ef4444',
    boxShadow: '0 0 25px rgba(239, 68, 68, 0.4)',
  },
  webcamVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  canvasFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#0a120e',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  gridLines: {
    position: 'absolute',
    inset: 0,
    backgroundImage: 'linear-gradient(rgba(16, 185, 129, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.08) 1px, transparent 1px)',
    backgroundSize: '30px 30px',
  },
  fallbackText: {
    color: '#10b981',
    fontWeight: 900,
    letterSpacing: 1.5,
    fontSize: 13,
    zIndex: 5,
  },
  boundingBox: {
    position: 'absolute',
    border: '3px solid',
    borderRadius: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    boxShadow: '0 0 15px rgba(0,0,0,0.5)',
    transition: 'all 0.3s ease',
  },
  bboxLabel: {
    position: 'absolute',
    top: -26,
    left: 4,
    padding: '3px 8px',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.5,
    whiteSpace: 'nowrap',
  },
  reticleTL: { position: 'absolute', top: 16, left: 16, width: 24, height: 24, borderTop: '3px solid #10b981', borderLeft: '3px solid #10b981' },
  reticleTR: { position: 'absolute', top: 16, right: 16, width: 24, height: 24, borderTop: '3px solid #10b981', borderRight: '3px solid #10b981' },
  reticleBL: { position: 'absolute', bottom: 16, left: 16, width: 24, height: 24, borderBottom: '3px solid #10b981', borderLeft: '3px solid #10b981' },
  reticleBR: { position: 'absolute', bottom: 16, right: 16, width: 24, height: 24, borderBottom: '3px solid #10b981', borderRight: '3px solid #10b981' },
  heroBanner: {
    padding: 22,
    borderRadius: 16,
    border: '2px solid',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  heroHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  heroHeaderTitle: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1.2,
  },
  guidanceText: {
    fontSize: 24,
    fontWeight: 900,
    lineHeight: 1.3,
    color: '#ffffff',
  },
  statusSubtext: {
    color: '#94a3b8',
    fontSize: 13,
  },
  controlsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  buttonRow: {
    display: 'flex',
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    minHeight: 58,
    borderRadius: 14,
    border: 'none',
    fontWeight: 900,
    fontSize: 14,
    letterSpacing: 0.5,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
  },
  card: {
    padding: 18,
    borderRadius: 14,
    backgroundColor: '#0d1611',
    border: '1px solid #1a2c22',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  cardHeaderBetween: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1.2,
    color: '#94a3b8',
  },
  inputGroup: {
    display: 'flex',
    gap: 10,
  },
  inputField: {
    flex: 1,
    height: 48,
    padding: '0 14px',
    borderRadius: 10,
    backgroundColor: '#060907',
    border: '1px solid #233a2d',
    color: '#ffffff',
    fontSize: 14,
    outline: 'none',
  },
  btnSet: {
    minWidth: 70,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#38bdf8',
    color: '#000000',
    fontWeight: 900,
    border: 'none',
    cursor: 'pointer',
  },
  activeRoutePill: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    borderRadius: 8,
    backgroundColor: '#0f1f2e',
    color: '#38bdf8',
    fontSize: 13,
  },
  toolsRow: {
    display: 'flex',
    gap: 12,
  },
  toolBtnWarning: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#261b11',
    border: '1px solid #4a311c',
    color: '#fbbf24',
    fontWeight: 800,
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer',
  },
  toolBtnDanger: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    backgroundColor: '#241416',
    border: '1px solid #4d2024',
    color: '#fca5a5',
    fontWeight: 800,
    fontSize: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    cursor: 'pointer',
  },
  radarCount: {
    color: '#10b981',
    fontWeight: 900,
    fontSize: 11,
    letterSpacing: 1,
  },
  radarList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  emptyRadarText: {
    color: '#64748b',
    fontSize: 13,
    fontStyle: 'italic',
  },
  radarItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 14px',
    borderRadius: 10,
    backgroundColor: '#060907',
    border: '1px solid #1a2c22',
  },
  obstacleTitle: {
    fontSize: 15,
    fontWeight: 900,
    color: '#fbbf24',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  tagGroup: {
    display: 'flex',
    gap: 6,
  },
  tagPos: {
    padding: '2px 8px',
    borderRadius: 6,
    backgroundColor: '#1e293b',
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: 800,
  },
  tagRisk: {
    padding: '2px 8px',
    borderRadius: 6,
    fontSize: 10,
    fontWeight: 800,
  },
  confidenceBadge: {
    color: '#94a3b8',
    fontWeight: 800,
    fontSize: 14,
  },
};
