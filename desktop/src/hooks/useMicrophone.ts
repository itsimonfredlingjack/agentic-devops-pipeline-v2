import { useState, useRef, useCallback } from "react";
import { useAppStore } from "../stores/appStore";

export function useMicrophone() {
  const [recording, setRecording] = useState(false);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const voiceUrl = useAppStore((s) => s.voiceUrl);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunks.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());

        const store = useAppStore.getState();
        store.setPipelineStatus("processing");

        try {
          const form = new FormData();
          form.append("file", blob, "recording.webm");
          const resp = await fetch(`${voiceUrl}/api/pipeline/run/audio`, {
            method: "POST",
            body: form,
          });

          if (!resp.ok) {
            store.setPipelineStatus("error");
            return;
          }

          const data = await resp.json();
          if (data.status === "preview_needed") {
            const fallbackIntent = {
              summary: data.summary || "",
              description: "",
              acceptanceCriteria: "",
              issueType: "Story",
              priority: "Medium",
              labels: [] as string[],
              ambiguityScore: 0,
            };
            store.setPreview({
              sessionId: data.session_id,
              transcribedText: data.transcribed_text,
              summary: data.summary,
              intent: data.intent
                ? {
                    summary: data.intent.summary,
                    description: data.intent.description,
                    acceptanceCriteria: data.intent.acceptance_criteria,
                    issueType: data.intent.issue_type,
                    priority: data.intent.priority,
                    labels: data.intent.labels,
                    ambiguityScore: data.intent.ambiguity_score,
                  }
                : fallbackIntent,
            });
            store.setPipelineStatus("previewing");
          } else if (data.status === "clarification_needed") {
            store.setClarification({
              sessionId: data.session_id,
              questions: data.questions,
              partialSummary: data.partial_summary,
              round: data.round,
            });
            store.setPipelineStatus("clarifying");
          } else if (data.ticket_key) {
            store.setTicketKey(data.ticket_key);
            store.setPipelineStatus("done");
          }
        } catch {
          store.setPipelineStatus("error");
        }
      };

      mediaRecorder.current = recorder;
      recorder.start();
      setRecording(true);
      useAppStore.getState().setPipelineStatus("recording");
    } catch {
      useAppStore.getState().setPipelineStatus("error");
    }
  }, [voiceUrl]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
      setRecording(false);
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [recording, startRecording, stopRecording]);

  return { recording, toggleRecording };
}
