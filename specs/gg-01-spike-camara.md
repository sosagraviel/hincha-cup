# GG-01: Spike — Validación de grabación de cámara en navegador (getUserMedia + MediaRecorder)

## User Story

**As a** development team building the GG React application  
**I want to** validate that `getUserMedia` + `MediaRecorder` can reliably capture and record 10 seconds of video inside a React component on real iOS Safari and Android devices  
**So that** we can confirm or reject this browser API approach before committing engineering effort, eliminating the top-priority technical risk on Day 1

## Stakeholders

| Role | Responsibility |
|------|---------------|
| Tech Lead | Accepts spike findings; makes architecture go/no-go decision |
| Development Team | Executes spike, writes PoC component, documents results |
| Product Owner | Informed of feasibility outcome before next sprint commitment |

## Success Criteria

1. A React PoC component records a 10-second video clip on a real iOS device running Safari without errors
2. A React PoC component records a 10-second video clip on a real Android device (Chrome) without errors
3. Camera and microphone permission flows are validated on both platforms (grant, deny, re-request)
4. At least one viable MIME type / codec is identified and verified per platform via `MediaRecorder.isTypeSupported()`
5. A structured findings report is produced documenting: supported codecs, permission model, known limitations, and a go/no-go recommendation

## Metrics

Feasibility confirmed when: both platforms complete a 10-second recording **and** produce a playable `<video>` blob in the React component without runtime errors.

## Acceptance Criteria

### Scenario 1: Successful 10-second recording on Android

```gherkin
Given a real Android device with Chrome browser
  And the React PoC page is served over HTTPS
  And the user has granted camera and microphone permissions
When the user taps "Iniciar grabación" and waits 10 seconds
  And the recording stops automatically after 10 seconds
Then a video blob is produced using a supported MIME type (e.g., video/webm;codecs=vp8)
  And the React component renders a <video> element with the ObjectURL
  And the video is playable in the browser
  And the recorded duration is 10 seconds (±1s)
  And no JavaScript errors appear in the DevTools console
```

### Scenario 2: Successful 10-second recording on iOS Safari

```gherkin
Given a real iOS device (iPhone, iOS 14.3+) with Safari browser
  And the React PoC page is served over HTTPS
  And the user has granted camera and microphone permissions
When the user taps "Iniciar grabación" and waits 10 seconds
  And the recording stops automatically after 10 seconds
Then a video blob is produced using a supported MIME type (e.g., video/mp4)
  And the React component renders a <video> element with the ObjectURL
  And the video is playable in Safari
  And the recorded duration is 10 seconds (±1s)
  And no JavaScript errors appear in the DevTools console
```

### Scenario 3: Permission denied handling

```gherkin
Given a real device (iOS or Android) with Safari/Chrome
  And the user denies the camera permission when prompted by the browser
When the React component calls getUserMedia({ video: true, audio: true })
Then the component catches the NotAllowedError
  And renders a clear, user-facing error message
  And does not crash or enter an unrecoverable state
  And displays a retry affordance
```

### Scenario 4: Codec negotiation — unsupported MIME type

```gherkin
Given a device that does not support the preferred MIME type (e.g., video/webm on iOS Safari)
When the React component initializes MediaRecorder
  And probes MediaRecorder.isTypeSupported() across the priority codec list
Then the component selects the next supported MIME type from the list
  And logs the selected codec to the console for reporting
  And proceeds with recording using the fallback type without error
```

### Scenario 5: MediaRecorder API unavailable

```gherkin
Given a browser that does not support the MediaRecorder API
  Or a device running iOS < 14.3
When the React PoC component mounts
Then the component detects the missing API (typeof MediaRecorder === 'undefined')
  And renders a clear unsupported-browser message
  And does not attempt to call getUserMedia or instantiate MediaRecorder
```

## Technical Context

### Current State

- No browser camera recording code exists in the GG React application today
- This is Day 1 of the project — the spike validates API feasibility before any architecture commitment

### Proposed Changes

- Create a React PoC component (`CameraSpikeRecorder`) that:
  - Calls `navigator.mediaDevices.getUserMedia({ video: true, audio: true })` on user interaction
  - Instantiates `MediaRecorder` with runtime codec negotiation via `MediaRecorder.isTypeSupported()`
  - Records for exactly 10 seconds (auto-stops via `useEffect` cleanup + `setTimeout`)
  - Accumulates `ondataavailable` chunks via a `useRef`
  - On stop: assembles a `Blob`, creates an `ObjectURL`, and renders a `<video>` for playback
  - Surfaces all errors (permission denied, unsupported browser, empty blob) as visible UI state
  - Logs codec, blob size, duration, and device info to the console for the findings report

### Platform Codec Matrix

| Platform | Supported MIME Types | Notes |
|----------|---------------------|-------|
| iOS Safari (14.3+) | `video/mp4` | `video/webm` **not** supported; HTTPS required; must be triggered by user gesture |
| Android Chrome | `video/webm;codecs=vp8`, `video/webm;codecs=vp9`, `video/mp4` | Broader support; VP9 may be absent on low-end devices |
| Firefox (desktop) | `video/webm;codecs=vp8`, `video/ogg` | Reference baseline |

**Recommended codec priority list:**
```ts
const PREFERRED_MIME_TYPES = [
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "", // browser default
];
```

### Technical Constraints

- **HTTPS mandatory** — `getUserMedia` is blocked on non-secure origins; serve via `localhost` (treated as secure) or a tunnel (ngrok / localtunnel) for real-device access
- **User gesture required** — `getUserMedia` must be called inside a click/tap handler on both iOS and Android; calling on mount will be blocked
- **iOS MediaRecorder available from iOS 14.3** (March 2021); older versions require an alternative approach
- **Background tab on iOS** — the OS may pause recording when the tab is backgrounded; this is out of scope for the spike but must be documented if observed
- **Real physical devices required** — simulators and emulators do not accurately reflect MediaRecorder codec behavior

### Integration Points

- `navigator.mediaDevices.getUserMedia` — browser permission and stream API
- `MediaRecorder` Web API — recording
- `URL.createObjectURL` / `URL.revokeObjectURL` — blob-to-URL for playback
- Real device access: USB debugging (Android DevTools remote) or iOS device on the same local network via HTTPS tunnel

### Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| React functional component with hooks | Target app is React-based; PoC must validate integration at the framework level, not just browser API level |
| Runtime codec negotiation via `isTypeSupported()` | Never hard-code a MIME type; iOS and Android diverge; probing at runtime is the only portable approach |
| `useRef` for chunk accumulation | Chunks arrive asynchronously via `ondataavailable`; `useState` triggers re-renders on each chunk and is inappropriate here |
| `useEffect` for stream and recorder teardown | Prevents stream leaks on component unmount — critical for mobile battery/camera LED behavior |
| In-browser playback as validation signal | Server upload is out of scope for this spike; playback confirms codec + container correctness without backend dependency |

### Wiki Evidence

Not applicable — this spike concerns browser platform APIs external to the qubika-agentic-framework codebase; the QAF wiki covers the orchestration CLI and Docusaurus website only.

### Graph Evidence

graph impact-radius check skipped — spike creates new PoC files; no existing file paths to measure against the code graph.

## Out Of Scope

- Server-side video upload, storage, or transcoding
- Audio-only recording
- Screen recording (`getDisplayMedia`)
- Video compression or post-processing
- Framework integration beyond the PoC component (production-ready component is a follow-up ticket)
- Support for browsers other than iOS Safari and Android Chrome/WebView
- iOS < 14.3 support

## Future Considerations

- If feasibility confirmed: implement production-ready `useMediaRecorder` React hook with full error recovery
- Codec normalization pipeline: convert `mp4`/`webm` to a unified server-side format (e.g., via FFmpeg)
- Progressive enhancement: graceful degradation UI for unsupported browsers
- Explore `WebCodecs` API for finer-grained codec control (Chrome 94+, no iOS support yet)
- Background recording resilience (iOS tab-pause handling)

## Edge Cases And Error Handling

| Case | Handling |
|------|----------|
| Permission denied (first request) | Catch `NotAllowedError`; show actionable error UI with retry button |
| Permission denied permanently | Catch `NotAllowedError`; guide user to browser settings to re-enable camera |
| MediaRecorder not supported (iOS < 14.3) | Detect `typeof MediaRecorder === 'undefined'`; show minimum-version message |
| Recording interrupted (tab backgrounded on iOS) | Detect `pause` event on recorder; surface warning; document in findings report |
| Empty blob produced | Detect `blob.size === 0`; log MIME type and device info; mark as codec failure in findings |
| `getUserMedia` stream not returned (camera busy) | Catch `NotReadableError`; show "camera in use by another app" message |
| HTTPS not available on test URL | `getUserMedia` will throw `SecurityError`; PoC should display HTTPS requirement notice |
| `useEffect` cleanup on unmount mid-recording | Stop all tracks and call `recorder.stop()` to prevent stream leak |

## Validation Rules

- Recording must complete without `MediaRecorder` `onerror` events
- Produced `Blob.size` must be > 0 bytes
- Playback in the React `<video>` element must start within 3 seconds of `objectURL` assignment
- `MediaRecorder.isTypeSupported(selectedMimeType)` must return `true` for the chosen codec
- All test runs must be executed on real physical devices — simulators/emulators are not valid

## Dependencies

- **Blocking**: None — Day 1 spike, no prior tickets required
- **Related**: All GG tickets that depend on camera recording functionality (to be unblocked by this spike's go/no-go decision)

## Definition Of Done

### Code Quality

- [ ] `CameraSpikeRecorder` React component committed to the repository (spike branch or shared PR)
- [ ] Codec negotiation logic is clearly readable and extractable as a standalone hook
- [ ] `useEffect` cleanup handles stream teardown correctly (no camera LED left on)
- [ ] TypeScript types used throughout (no `any`)

### Testing

- [ ] Recording validated on at least 1 real iOS device (iPhone, iOS 14.3+, Safari)
- [ ] Recording validated on at least 1 real Android device (Chrome or default browser)
- [ ] All 5 BDD acceptance criteria manually verified and documented with device/OS/browser versions
- [ ] Permission denied path verified on both platforms
- [ ] Codec negotiation fallback path verified on iOS (webm → mp4)

### Documentation

- [ ] Findings report created (markdown) covering:
  - Device model, OS version, browser version per test run
  - MIME type selected by codec negotiation per platform
  - Blob size and playback result per test run
  - Errors encountered (console output, screenshots if applicable)
  - **Go / No-Go recommendation** with rationale
- [ ] Open questions and follow-up risks logged as new tickets if feasibility is confirmed

### Review And Deployment

- [ ] Findings reviewed with Tech Lead before end of Day 1
- [ ] Architecture decision (go / no-go) recorded and communicated before Day 2 planning begins

## Assumptions And Open Questions

| # | Assumption | Impact If Wrong |
|---|-----------|-----------------|
| 1 | In-browser playback validation is sufficient (no server upload) | Medium — if server codec compatibility must be validated, extend scope to include a backend round-trip |
| 2 | iOS 14.3+ is the minimum supported iOS version | High — if older iOS must be supported, MediaRecorder is not viable; a native bridge would be required |
| 3 | Audio must be recorded alongside video (microphone required) | Low — if video-only, remove `audio: true` from `getUserMedia` constraints; simplifies permission flow |

## Implementation Notes

**Recommended PoC component structure:**

```tsx
import { useRef, useState, useEffect } from "react";

const PREFERRED_MIME_TYPES = [
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "",
];

function selectMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  return PREFERRED_MIME_TYPES.find(
    (m) => !m || MediaRecorder.isTypeSupported(m)
  ) ?? "";
}

export function CameraSpikeRecorder() {
  const [status, setStatus] = useState<"idle" | "recording" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [selectedMime, setSelectedMime] = useState<string>("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const previewRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    };
  }, [playbackUrl]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      streamRef.current = stream;
      if (previewRef.current) previewRef.current.srcObject = stream;

      const mimeType = selectMimeType();
      setSelectedMime(mimeType || "(browser default)");
      console.log(`[GG-01 Spike] MIME type selected: ${mimeType || "(browser default)"}`);

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || "video/mp4",
        });
        console.log(`[GG-01 Spike] Blob size: ${blob.size} bytes`);
        if (blob.size === 0) {
          setStatus("error");
          setErrorMsg("Blob vacío — fallo de codec. Ver consola.");
          return;
        }
        setPlaybackUrl(URL.createObjectURL(blob));
        setStatus("done");
        stream.getTracks().forEach((t) => t.stop());
      };

      recorderRef.current = recorder;
      recorder.start();
      setStatus("recording");

      setTimeout(() => {
        if (recorderRef.current?.state === "recording") {
          recorderRef.current.stop();
        }
      }, 10_000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatus("error");
      setErrorMsg(msg);
      console.error("[GG-01 Spike] Error:", err);
    }
  }

  if (typeof MediaRecorder === "undefined") {
    return <p>MediaRecorder no soportado en este navegador (iOS &lt; 14.3?).</p>;
  }

  return (
    <div>
      <video ref={previewRef} autoPlay muted playsInline style={{ width: "100%" }} />
      {status === "idle" && (
        <button onClick={startRecording}>Iniciar grabación (10s)</button>
      )}
      {status === "recording" && <p>Grabando... (10 segundos)</p>}
      {status === "done" && playbackUrl && (
        <>
          <p>Grabación completada — codec: {selectedMime}</p>
          <video src={playbackUrl} controls style={{ width: "100%" }} />
        </>
      )}
      {status === "error" && (
        <>
          <p style={{ color: "red" }}>Error: {errorMsg}</p>
          <button onClick={() => setStatus("idle")}>Reintentar</button>
        </>
      )}
    </div>
  );
}
```

**Real-device testing setup:**
```bash
# Serve PoC over HTTPS for real-device access
npx serve build --ssl   # or
npx localtunnel --port 3000  # creates https://xxx.loca.lt
```

**Findings report template (per device):**

| Field | iOS Result | Android Result |
|-------|-----------|----------------|
| Device model | | |
| OS version | | |
| Browser version | | |
| MIME type selected | | |
| Blob size (bytes) | | |
| Playback success | | |
| Errors encountered | | |

## References

- [MDN: MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [MDN: MediaDevices.getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia)
- [Can I Use: MediaRecorder](https://caniuse.com/mediarecorder)
- [WebKit blog: MediaRecorder on iOS (iOS 14.3)](https://webkit.org/blog/11353/mediarecorder-api/)
- [MDN: MediaRecorder.isTypeSupported()](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static)

---

**INVEST Validated**: ✅  
**BDD Scenarios**: 5  
**Priority**: High (Riesgo Crítico #1)  
**Estimated Duration**: 1 day (time-boxed spike)
