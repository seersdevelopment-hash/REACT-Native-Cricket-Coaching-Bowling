import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";

const STORAGE_KEY = "bowler-speed:sessions:v1";

const emptyCalibration = {
  cameraHeight: "1.2",
  distanceBehindStumps: "8",
  pitchScale: "20.12"
};

const routeTitles = {
  home: "Sessions",
  setup: "Camera setup",
  calibration: "Calibration",
  recording: "Record delivery",
  result: "Ball result",
  summary: "Session summary",
  history: "History"
};

export default function App() {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [route, setRoute] = useState("home");
  const [lastDelivery, setLastDelivery] = useState(null);

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)).catch(() => {});
  }, [sessions]);

  const activeSessionId = activeSession?.id;
  const savedActiveSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? activeSession,
    [activeSession, activeSessionId, sessions]
  );

  async function loadSessions() {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      setSessions(raw ? JSON.parse(raw) : []);
    } catch {
      setSessions([]);
    }
  }

  function startSession(details) {
    const session = {
      id: String(Date.now()),
      date: new Date().toISOString(),
      location: details.location || "Training ground",
      coachName: details.coachName || "Coach",
      notes: details.notes || "",
      calibration: emptyCalibration,
      deliveries: []
    };
    setSessions((current) => [session, ...current]);
    setActiveSession(session);
    setRoute("setup");
  }

  function updateCalibration(calibration) {
    updateSession(savedActiveSession.id, { calibration });
    setRoute("recording");
  }

  function addDelivery(deliveryDraft) {
    const session = sessions.find((item) => item.id === savedActiveSession.id) ?? savedActiveSession;
    const ballNumber = session.deliveries.length + 1;
    const delivery = {
      id: `${session.id}-${ballNumber}-${Date.now()}`,
      sessionId: session.id,
      ballNumber,
      createdAt: new Date().toISOString(),
      ...deliveryDraft
    };
    updateSession(session.id, {
      deliveries: [...session.deliveries, delivery]
    });
    setLastDelivery(delivery);
    setRoute("result");
  }

  function updateSession(id, patch) {
    setSessions((current) =>
      current.map((session) => (session.id === id ? { ...session, ...patch } : session))
    );
    setActiveSession((current) => (current?.id === id ? { ...current, ...patch } : current));
  }

  function openSession(session) {
    setActiveSession(session);
    setLastDelivery(session.deliveries.at(-1) ?? null);
    setRoute("summary");
  }

  function goBack() {
    if (route === "home") return;
    if (route === "setup") return setRoute("home");
    if (route === "calibration") return setRoute("setup");
    if (route === "recording") return setRoute("summary");
    if (route === "result") return setRoute("recording");
    if (route === "summary" || route === "history") return setRoute("home");
    setRoute("home");
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ExpoStatusBar style="dark" />
      <View style={styles.shell}>
        <Header title={routeTitles[route]} canGoBack={route !== "home"} onBack={goBack} />
        {route === "home" && (
          <HomeScreen sessions={sessions} onStart={startSession} onOpenHistory={() => setRoute("history")} />
        )}
        {route === "setup" && <SetupScreen onContinue={() => setRoute("calibration")} />}
        {route === "calibration" && (
          <CalibrationScreen
            initialValue={savedActiveSession?.calibration ?? emptyCalibration}
            onSave={updateCalibration}
          />
        )}
        {route === "recording" && (
          <RecordingScreen
            session={savedActiveSession}
            onDeliveryReady={addDelivery}
            onSummary={() => setRoute("summary")}
          />
        )}
        {route === "result" && (
          <ResultScreen
            delivery={lastDelivery}
            onNextBall={() => setRoute("recording")}
            onSummary={() => setRoute("summary")}
          />
        )}
        {route === "summary" && (
          <SummaryScreen session={savedActiveSession} onNextBall={() => setRoute("recording")} />
        )}
        {route === "history" && <HistoryScreen sessions={sessions} onOpenSession={openSession} />}
      </View>
    </SafeAreaView>
  );
}

function Header({ title, canGoBack, onBack }) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        disabled={!canGoBack}
        onPress={onBack}
        style={[styles.iconButton, !canGoBack && styles.iconButtonHidden]}
      >
        <Text style={styles.iconButtonText}>‹</Text>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
      <View style={styles.iconButtonPlaceholder} />
    </View>
  );
}

function HomeScreen({ sessions, onStart, onOpenHistory }) {
  const [coachName, setCoachName] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.heroBand}>
        <Text style={styles.kicker}>Cricket speed tracking</Text>
        <Text style={styles.heroTitle}>Bowler Speed</Text>
        <Text style={styles.heroCopy}>
          Record one delivery at a time, review the clip, and store a speed reading with confidence for each ball.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>New practice session</Text>
        <Field label="Coach name" value={coachName} onChangeText={setCoachName} placeholder="e.g. Steve" />
        <Field label="Location" value={location} onChangeText={setLocation} placeholder="e.g. Main nets" />
        <Field
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Focus, group, pitch condition"
          multiline
        />
        <PrimaryButton label="Start session" onPress={() => onStart({ coachName, location, notes })} />
      </View>

      <View style={styles.rowBetween}>
        <Text style={styles.sectionTitle}>Recent sessions</Text>
        <SecondaryButton label="History" onPress={onOpenHistory} />
      </View>
      {sessions.length === 0 ? (
        <EmptyState title="No sessions yet" body="Start a session to capture your first set of deliveries." />
      ) : (
        sessions.slice(0, 3).map((session) => <SessionCard key={session.id} session={session} />)
      )}
    </ScrollView>
  );
}

function SetupScreen({ onContinue }) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.pitchPreview}>
        <View style={styles.pitchLine} />
        <View style={styles.stumps} />
        <View style={styles.phoneMarker}>
          <Text style={styles.phoneMarkerText}>Phone</Text>
        </View>
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Tripod placement</Text>
        <ChecklistItem label="Place phone 6-10 m behind the stumps at the bowler's end." />
        <ChecklistItem label="Use the rear camera in portrait with the full pitch visible." />
        <ChecklistItem label="Keep camera height between 1.0 m and 1.6 m for the MVP." />
        <ChecklistItem label="Align the pitch centre line with the guide and avoid backlighting." />
        <WarningBox text="The app will flag setup risk when height or distance is outside the recommended range." />
        <PrimaryButton label="Continue to calibration" onPress={onContinue} />
      </View>
    </ScrollView>
  );
}

function CalibrationScreen({ initialValue, onSave }) {
  const [form, setForm] = useState(initialValue);
  const height = Number(form.cameraHeight);
  const distance = Number(form.distanceBehindStumps);
  const setupWarnings = [
    height && (height < 1 || height > 1.6) ? "Camera height should be between 1.0 m and 1.6 m." : null,
    distance && (distance < 6 || distance > 10) ? "Distance behind stumps should be between 6 m and 10 m." : null
  ].filter(Boolean);

  function save() {
    if (!height || !distance || !Number(form.pitchScale)) {
      Alert.alert("Calibration incomplete", "Enter numeric values for all calibration fields.");
      return;
    }
    onSave(form);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Known dimensions</Text>
        <Text style={styles.bodyText}>
          The MVP uses pitch and stump references to convert tracked ball motion from pixels into metres.
        </Text>
        <Field
          label="Camera height (m)"
          value={form.cameraHeight}
          onChangeText={(cameraHeight) => setForm({ ...form, cameraHeight })}
          keyboardType="decimal-pad"
        />
        <Field
          label="Distance behind stumps (m)"
          value={form.distanceBehindStumps}
          onChangeText={(distanceBehindStumps) => setForm({ ...form, distanceBehindStumps })}
          keyboardType="decimal-pad"
        />
        <Field
          label="Pitch reference length (m)"
          value={form.pitchScale}
          onChangeText={(pitchScale) => setForm({ ...form, pitchScale })}
          keyboardType="decimal-pad"
        />
        {setupWarnings.map((warning) => (
          <WarningBox key={warning} text={warning} />
        ))}
        <PrimaryButton label="Save calibration" onPress={save} />
      </View>
    </ScrollView>
  );
}

function RecordingScreen({ session, onDeliveryReady, onSummary }) {
  const cameraRef = useRef(null);
  const recordingPromiseRef = useRef(null);
  const startedAtRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [isRecording, setIsRecording] = useState(false);
  const [recordingElapsed, setRecordingElapsed] = useState(0);

  useEffect(() => {
    if (!isRecording) return undefined;
    const interval = setInterval(() => {
      setRecordingElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 250);
    return () => clearInterval(interval);
  }, [isRecording]);

  async function startRecording() {
    if (!cameraRef.current || isRecording) return;
    try {
      startedAtRef.current = Date.now();
      setRecordingElapsed(0);
      setIsRecording(true);
      recordingPromiseRef.current = cameraRef.current.recordAsync({
        maxDuration: 12,
        quality: "720p"
      });
    } catch {
      setIsRecording(false);
      Alert.alert("Recording failed", "Could not start the camera recording.");
    }
  }

  async function stopRecording() {
    if (!isRecording || !cameraRef.current) return;
    try {
      cameraRef.current.stopRecording();
      const recording = await recordingPromiseRef.current;
      const durationSeconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      onDeliveryReady(createMockDelivery(recording?.uri, durationSeconds, session));
    } catch {
      Alert.alert("Recording failed", "The delivery clip could not be saved.");
    } finally {
      setIsRecording(false);
      recordingPromiseRef.current = null;
      startedAtRef.current = null;
    }
  }

  if (!permission) {
    return <LoadingPanel title="Checking camera permission" />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.content}>
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Camera access needed</Text>
          <Text style={styles.bodyText}>
            Bowler Speed needs the rear camera to record delivery clips for speed estimation.
          </Text>
          <PrimaryButton label="Allow camera" onPress={requestPermission} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.recordingLayout}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" mode="video">
        <View style={styles.cameraOverlay}>
          <View style={styles.frameGuide}>
            <View style={styles.frameGuideLine} />
          </View>
          <View style={styles.cameraTopBar}>
            <Text style={styles.cameraBadge}>Ball {(session?.deliveries?.length ?? 0) + 1}</Text>
            <Text style={styles.cameraBadge}>{isRecording ? `${recordingElapsed}s` : "Ready"}</Text>
          </View>
        </View>
      </CameraView>
      <View style={styles.recordControls}>
        <SecondaryButton label="Summary" onPress={onSummary} />
        <Pressable
          accessibilityRole="button"
          onPress={isRecording ? stopRecording : startRecording}
          style={[styles.recordButton, isRecording && styles.recordButtonActive]}
        >
          <Text style={styles.recordButtonText}>{isRecording ? "Stop" : "Record"}</Text>
        </Pressable>
        <View style={styles.controlSpacer} />
      </View>
    </View>
  );
}

function ResultScreen({ delivery, onNextBall, onSummary }) {
  if (!delivery) return <LoadingPanel title="No delivery selected" />;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.resultHero}>
        <Text style={styles.kicker}>Ball {delivery.ballNumber}</Text>
        <Text style={styles.speedText}>{delivery.speedKph}</Text>
        <Text style={styles.speedUnit}>km/h</Text>
        <ConfidencePill confidence={delivery.confidence} />
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Replay</Text>
        <Text style={styles.bodyText}>{delivery.videoPath ? delivery.videoPath : "No video path returned."}</Text>
        <MetricRow label="Tracking window" value={`${delivery.trackingWindowMetres} m`} />
        <MetricRow label="Clip duration" value={`${delivery.durationSeconds}s`} />
        <MetricRow label="Result status" value={delivery.confidenceLabel} />
        <WarningBox text={delivery.notes} />
      </View>
      <View style={styles.actionRow}>
        <SecondaryButton label="Session summary" onPress={onSummary} />
        <PrimaryButton label="Next ball" onPress={onNextBall} />
      </View>
    </ScrollView>
  );
}

function SummaryScreen({ session, onNextBall }) {
  const deliveries = session?.deliveries ?? [];
  const average = deliveries.length
    ? Math.round(deliveries.reduce((total, delivery) => total + delivery.speedKph, 0) / deliveries.length)
    : 0;
  const best = deliveries.reduce((max, delivery) => Math.max(max, delivery.speedKph), 0);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.statsGrid}>
        <Stat label="Balls" value={String(deliveries.length)} />
        <Stat label="Average" value={average ? `${average}` : "-"} suffix="km/h" />
        <Stat label="Fastest" value={best ? `${best}` : "-"} suffix="km/h" />
      </View>
      <PrimaryButton label="Record next ball" onPress={onNextBall} />
      <Text style={styles.sectionTitle}>Deliveries</Text>
      {deliveries.length === 0 ? (
        <EmptyState title="No deliveries recorded" body="Record the first ball to start building the session." />
      ) : (
        deliveries.map((delivery) => <DeliveryCard key={delivery.id} delivery={delivery} />)
      )}
    </ScrollView>
  );
}

function HistoryScreen({ sessions, onOpenSession }) {
  return (
    <FlatList
      contentContainerStyle={styles.content}
      data={sessions}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={<EmptyState title="No saved sessions" body="Completed sessions will appear here." />}
      renderItem={({ item }) => (
        <Pressable accessibilityRole="button" onPress={() => onOpenSession(item)}>
          <SessionCard session={item} />
        </Pressable>
      )}
    />
  );
}

function Field({ label, multiline, ...props }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor="#77838f"
        style={[styles.input, multiline && styles.inputMultiline]}
      />
    </View>
  );
}

function PrimaryButton({ label, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.primaryButton}>
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondaryButton}>
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function ChecklistItem({ label }) {
  return (
    <View style={styles.checkItem}>
      <View style={styles.checkDot} />
      <Text style={styles.checkText}>{label}</Text>
    </View>
  );
}

function WarningBox({ text }) {
  return (
    <View style={styles.warningBox}>
      <Text style={styles.warningText}>{text}</Text>
    </View>
  );
}

function ConfidencePill({ confidence }) {
  const isLow = confidence < 0.68;
  return (
    <View style={[styles.confidencePill, isLow && styles.confidencePillLow]}>
      <Text style={[styles.confidenceText, isLow && styles.confidenceTextLow]}>
        {Math.round(confidence * 100)}% confidence
      </Text>
    </View>
  );
}

function MetricRow({ label, value }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function SessionCard({ session }) {
  const count = session.deliveries?.length ?? 0;
  const date = new Date(session.date).toLocaleDateString();
  return (
    <View style={styles.sessionCard}>
      <View>
        <Text style={styles.sessionTitle}>{session.location}</Text>
        <Text style={styles.sessionMeta}>
          {date} · {session.coachName}
        </Text>
      </View>
      <View style={styles.sessionCount}>
        <Text style={styles.sessionCountValue}>{count}</Text>
        <Text style={styles.sessionCountLabel}>balls</Text>
      </View>
    </View>
  );
}

function DeliveryCard({ delivery }) {
  return (
    <View style={styles.deliveryCard}>
      <Text style={styles.deliveryBall}>Ball {delivery.ballNumber}</Text>
      <View>
        <Text style={styles.deliverySpeed}>{delivery.speedKph} km/h</Text>
        <Text style={styles.deliveryMeta}>{Math.round(delivery.confidence * 100)}% confidence</Text>
      </View>
    </View>
  );
}

function Stat({ label, value, suffix }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      {suffix ? <Text style={styles.statSuffix}>{suffix}</Text> : null}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function EmptyState({ title, body }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyBody}>{body}</Text>
    </View>
  );
}

function LoadingPanel({ title }) {
  return (
    <View style={styles.content}>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>{title}</Text>
      </View>
    </View>
  );
}

function createMockDelivery(videoPath, durationSeconds, session) {
  const calibration = session?.calibration ?? emptyCalibration;
  const distance = Number(calibration.pitchScale) || 20.12;
  const estimatedFlightSeconds = Math.max(0.42, Math.min(0.82, durationSeconds / 10));
  const speedKph = Math.round((distance / estimatedFlightSeconds) * 3.6);
  const confidence = Math.max(0.52, Math.min(0.94, 0.86 - Math.abs(durationSeconds - 5) * 0.04));
  const confidenceLabel = confidence < 0.68 ? "Low confidence" : "Valid delivery";
  const notes =
    confidence < 0.68
      ? "Marked low confidence because the clip length is outside the expected delivery window."
      : "Mock result generated while the ball tracking model is pending.";

  return {
    speedKph,
    confidence,
    confidenceLabel,
    videoPath,
    durationSeconds,
    trackingWindowMetres: distance,
    notes
  };
}

const palette = {
  ink: "#17212b",
  muted: "#5f6f7f",
  line: "#dbe3ea",
  paper: "#f6f8fa",
  white: "#ffffff",
  green: "#0f7b57",
  greenDark: "#07543c",
  red: "#c83532",
  amberBg: "#fff4d6",
  amberInk: "#6e5200",
  blue: "#255e91"
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: palette.paper,
    paddingTop: StatusBar.currentHeight || 0
  },
  shell: {
    flex: 1,
    backgroundColor: palette.paper
  },
  header: {
    minHeight: 58,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    backgroundColor: palette.white,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  headerTitle: {
    color: palette.ink,
    fontSize: 17,
    fontWeight: "700"
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.paper
  },
  iconButtonHidden: {
    opacity: 0
  },
  iconButtonPlaceholder: {
    width: 36,
    height: 36
  },
  iconButtonText: {
    color: palette.ink,
    fontSize: 28,
    lineHeight: 30
  },
  content: {
    padding: 18,
    gap: 16
  },
  heroBand: {
    backgroundColor: "#e9f2ef",
    borderRadius: 8,
    padding: 22,
    borderWidth: 1,
    borderColor: "#c9ded7"
  },
  kicker: {
    color: palette.greenDark,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    textTransform: "uppercase"
  },
  heroTitle: {
    color: palette.ink,
    fontSize: 34,
    fontWeight: "800",
    marginTop: 6
  },
  heroCopy: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10
  },
  panel: {
    backgroundColor: palette.white,
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: palette.line,
    gap: 14
  },
  panelTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  sectionTitle: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800"
  },
  bodyText: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22
  },
  field: {
    gap: 7
  },
  fieldLabel: {
    color: palette.ink,
    fontSize: 13,
    fontWeight: "700"
  },
  input: {
    minHeight: 46,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.paper,
    paddingHorizontal: 12,
    color: palette.ink,
    fontSize: 15
  },
  inputMultiline: {
    minHeight: 80,
    paddingTop: 12,
    textAlignVertical: "top"
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.green,
    paddingHorizontal: 18
  },
  primaryButtonText: {
    color: palette.white,
    fontSize: 15,
    fontWeight: "800"
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    paddingHorizontal: 14
  },
  secondaryButtonText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700"
  },
  rowBetween: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between"
  },
  pitchPreview: {
    height: 220,
    borderRadius: 8,
    backgroundColor: "#2f7d4c",
    borderWidth: 1,
    borderColor: "#21643b",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center"
  },
  pitchLine: {
    width: 96,
    height: 210,
    borderWidth: 2,
    borderColor: "#e6d7aa",
    backgroundColor: "#b9955d"
  },
  stumps: {
    position: "absolute",
    top: 22,
    width: 44,
    height: 5,
    backgroundColor: palette.white
  },
  phoneMarker: {
    position: "absolute",
    bottom: 20,
    width: 84,
    minHeight: 34,
    borderRadius: 8,
    backgroundColor: palette.ink,
    alignItems: "center",
    justifyContent: "center"
  },
  phoneMarkerText: {
    color: palette.white,
    fontSize: 12,
    fontWeight: "800"
  },
  checkItem: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start"
  },
  checkDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    marginTop: 6,
    backgroundColor: palette.green
  },
  checkText: {
    flex: 1,
    color: palette.ink,
    fontSize: 15,
    lineHeight: 21
  },
  warningBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ecd38a",
    backgroundColor: palette.amberBg,
    padding: 12
  },
  warningText: {
    color: palette.amberInk,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "600"
  },
  recordingLayout: {
    flex: 1
  },
  camera: {
    flex: 1
  },
  cameraOverlay: {
    flex: 1,
    padding: 16
  },
  cameraTopBar: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between"
  },
  cameraBadge: {
    overflow: "hidden",
    borderRadius: 8,
    backgroundColor: "rgba(23,33,43,0.78)",
    color: palette.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: "800"
  },
  frameGuide: {
    flex: 1,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.75)",
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center"
  },
  frameGuideLine: {
    width: 2,
    height: "82%",
    backgroundColor: "rgba(255,255,255,0.65)"
  },
  recordControls: {
    minHeight: 110,
    backgroundColor: palette.white,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18
  },
  recordButton: {
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: palette.red,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 6,
    borderColor: "#f3c2c1"
  },
  recordButtonActive: {
    backgroundColor: palette.ink,
    borderColor: "#b6c0ca"
  },
  recordButtonText: {
    color: palette.white,
    fontSize: 15,
    fontWeight: "800"
  },
  controlSpacer: {
    width: 92
  },
  resultHero: {
    backgroundColor: palette.ink,
    borderRadius: 8,
    padding: 24,
    alignItems: "center",
    gap: 8
  },
  speedText: {
    color: palette.white,
    fontSize: 64,
    fontWeight: "900"
  },
  speedUnit: {
    color: "#cdd8e2",
    fontSize: 16,
    fontWeight: "800"
  },
  confidencePill: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#dff3ea"
  },
  confidencePillLow: {
    backgroundColor: palette.amberBg
  },
  confidenceText: {
    color: palette.greenDark,
    fontSize: 13,
    fontWeight: "800"
  },
  confidenceTextLow: {
    color: palette.amberInk
  },
  metricRow: {
    minHeight: 38,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16
  },
  metricLabel: {
    color: palette.muted,
    fontSize: 14
  },
  metricValue: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "800"
  },
  actionRow: {
    flexDirection: "row",
    gap: 12
  },
  statsGrid: {
    flexDirection: "row",
    gap: 10
  },
  stat: {
    flex: 1,
    minHeight: 104,
    borderRadius: 8,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 12,
    justifyContent: "center",
    alignItems: "center"
  },
  statValue: {
    color: palette.ink,
    fontSize: 30,
    fontWeight: "900"
  },
  statSuffix: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "800"
  },
  statLabel: {
    color: palette.muted,
    fontSize: 13,
    fontWeight: "700",
    marginTop: 6
  },
  sessionCard: {
    minHeight: 84,
    borderRadius: 8,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  sessionTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  sessionMeta: {
    color: palette.muted,
    fontSize: 13,
    marginTop: 5
  },
  sessionCount: {
    minWidth: 58,
    alignItems: "center"
  },
  sessionCountValue: {
    color: palette.blue,
    fontSize: 24,
    fontWeight: "900"
  },
  sessionCountLabel: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700"
  },
  deliveryCard: {
    minHeight: 70,
    borderRadius: 8,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.line,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  deliveryBall: {
    color: palette.ink,
    fontSize: 15,
    fontWeight: "800"
  },
  deliverySpeed: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "900",
    textAlign: "right"
  },
  deliveryMeta: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 4,
    textAlign: "right"
  },
  emptyState: {
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: palette.line,
    padding: 18,
    backgroundColor: "#fbfcfd"
  },
  emptyTitle: {
    color: palette.ink,
    fontSize: 16,
    fontWeight: "800"
  },
  emptyBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6
  }
});
