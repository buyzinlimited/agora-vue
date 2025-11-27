<script setup>
import { ref, onMounted, onBeforeUnmount } from "vue";
import AgoraRTC from "agora-rtc-sdk-ng";
import { useMeetStore } from "@/stores/meet";

const meetStore = useMeetStore();

// ---------------- CONFIG ----------------
const APP_ID = "3d25a35f9a60404c8e2c7ac82f621505";
const CHANNEL = "proLiveClass";
const TOKEN =
  "007eJxTYHgi23nG7vvbhYxHsv51JUzTEYxxji5ptPtUen3G0/vZ1dcUGIxTjEwTjU3TLBPNDEwMTJItUo2SzROTLYzSzIwMTQ1M5x1Qz2wIZGQ4ySbNwAiFID4PQ0FRvk9mWapzTmJxMQMDAN29I4I=";
// ----------------------------------------

const localVideo = ref(null);
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });

let screenTrack = null;

// ---------------- LOAD USERS ----------------
onMounted(async () => {
  console.log("Loading users.json...");
  const res = await fetch("/users.json");
  const data = await res.json();

  meetStore.instructor = data.instructor;
  meetStore.students = data.students;

  console.log("Users loaded:", data);
});

// ---------------- JOIN CLASS ----------------
const joinClass = async () => {
  console.log("Joining class...");

  try {
    const uid = await client.join(APP_ID, CHANNEL, TOKEN);
    console.log("Joined RTC room with UID:", uid);
  } catch (err) {
    console.error("JOIN ERROR:", err);
    return;
  }

  // --- Create CAMERA TRACK ---
  try {
    console.log("Creating camera video track...");
    meetStore.localVideoTrack = await AgoraRTC.createCameraVideoTrack({
      encoderConfig: "720p",
      optimizationMode: "motion",
    });
    console.log("Camera track created:", meetStore.localVideoTrack);
  } catch (err) {
    console.error("CAMERA ERROR:", err);
  }

  // --- Create MICROPHONE TRACK ---
  try {
    console.log("Creating microphone track...");
    meetStore.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();
    console.log("Microphone track created:", meetStore.localAudioTrack);
  } catch (err) {
    console.error("MIC ERROR:", err);
  }

  // Play local camera
  try {
    if (meetStore.localVideoTrack) {
      console.log("Playing local video...");
      meetStore.localVideoTrack.play(localVideo.value);
    }
  } catch (err) {
    console.error("LOCAL VIDEO PLAY ERROR:", err);
  }

  // Publish Tracks
  try {
    console.log("Publishing tracks...");
    await client.publish(
      [meetStore.localVideoTrack, meetStore.localAudioTrack].filter(Boolean)
    );
    console.log("Tracks published");
  } catch (err) {
    console.error("PUBLISH ERROR:", err);
  }

  // --- Remote user published ---
  client.on("user-published", async (user, mediaType) => {
    console.log("User published:", user.uid, "type:", mediaType);

    await client.subscribe(user, mediaType);
    console.log("Subscribed to remote:", user.uid);

    if (!meetStore.remoteUsers.includes(user.uid)) {
      meetStore.remoteUsers.push(user.uid);
    }

    if (mediaType === "video") {
      console.log("Playing remote video:", user.uid);
      setTimeout(() => {
        user.videoTrack.play("remote-" + user.uid);
      }, 100);
    }

    if (mediaType === "audio") {
      console.log("Playing remote audio:", user.uid);
      user.audioTrack.play();
    }
  });

  // --- Remote user left ---
  client.on("user-unpublished", (user) => {
    console.warn("User unpublished:", user.uid);
    meetStore.remoteUsers = meetStore.remoteUsers.filter(
      (id) => id !== user.uid
    );
  });
};

// ---------------- LEAVE CLASS ----------------
const leaveClass = async () => {
  console.log("Leaving class...");

  try {
    if (meetStore.localVideoTrack) {
      console.log("Closing camera track");
      meetStore.localVideoTrack.close();
    }
    if (meetStore.localAudioTrack) {
      console.log("Closing mic track");
      meetStore.localAudioTrack.close();
    }
    if (screenTrack) {
      console.log("Closing screen track");
      screenTrack.close();
    }

    await client.leave();
    console.log("Left class successfully");
  } catch (err) {
    console.error("LEAVE ERROR:", err);
  }

  meetStore.remoteUsers = [];
};

onBeforeUnmount(leaveClass);

// ---------------- MIC TOGGLE ----------------
const toggleMic = async () => {
  console.log("Toggle MIC");

  if (!meetStore.localAudioTrack) return;

  const enabled = meetStore.localAudioTrack.enabled;
  meetStore.localAudioTrack.setEnabled(!enabled);

  console.log("Mic new state:", !enabled);
};

// ---------------- CAMERA TOGGLE ----------------
const toggleCamera = async () => {
  console.log("Toggle CAMERA");

  if (!meetStore.localVideoTrack) return;

  const enabled = meetStore.localVideoTrack.enabled;
  meetStore.localVideoTrack.setEnabled(!enabled);

  console.log("Camera new state:", !enabled);
};

// ---------------- SCREEN SHARE ----------------
const startScreenShare = async () => {
  if (!client || !meetStore.localVideoTrack) {
    console.warn(
      "Cannot start screen share: not joined yet or no camera track"
    );
    return;
  }

  console.log("Starting screen share...");
  try {
    screenTrack = await AgoraRTC.createScreenVideoTrack({}, "auto");

    console.log("Screen track created:", screenTrack);

    await client.unpublish(meetStore.localVideoTrack);
    console.log("Unpublished camera");

    await client.publish(screenTrack);
    console.log("Screen published");

    screenTrack.play(localVideo.value);

    screenTrack.on("track-ended", async () => {
      console.warn("Screen share ended by user!");

      await client.unpublish(screenTrack);
      await client.publish(meetStore.localVideoTrack);

      meetStore.localVideoTrack.play(localVideo.value);

      screenTrack = null;

      console.log("Returned to camera");
    });
  } catch (error) {
    console.error("SCREEN SHARE ERROR:", error);
  }
};
</script>

<template>
  <div class="flex items-start gap-4 p-6 space-y-6">
    <!-- Instructor -->
    <div class="flex-1 border rounded-xl p-5 shadow">
      <div class="flex items-center gap-4">
        <img
          :src="meetStore.instructor?.avatar"
          class="w-16 h-16 rounded-full border"
        />
        <p class="font-semibold text-lg">
          {{ meetStore.instructor?.name }}
        </p>
      </div>

      <div
        ref="localVideo"
        class="mt-3 bg-black rounded"
        style="width: 100%; height: 300px"
      ></div>

      <div class="mt-3 flex gap-2">
        <button @click="toggleMic" class="bg-yellow-500 px-4 py-2 rounded">
          Mic
        </button>
        <button @click="toggleCamera" class="bg-blue-500 px-4 py-2 rounded">
          Camera
        </button>
        <button
          @click="startScreenShare"
          class="bg-purple-500 px-4 py-2 rounded"
        >
          Screen
        </button>
      </div>
    </div>

    <!-- Students -->
    <div class="flex-none w-96 border rounded-xl p-5 shadow">
      <h2 class="text-xl font-bold mb-3">Students</h2>

      <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div
          v-for="s in meetStore.students"
          :key="s.id"
          class="flex flex-col items-center border p-3 rounded-lg"
        >
          <img :src="s.avatar" class="w-16 h-16 rounded-full mb-2" />
          <p class="font-semibold">{{ s.name }}</p>

          <div
            v-if="meetStore.remoteUsers.includes(s.id)"
            :id="'remote-' + s.id"
            class="mt-2 bg-black rounded"
            style="width: 100%; height: 150px"
          ></div>
        </div>
      </div>

      <!-- Buttons -->
      <div class="flex gap-3 mt-8">
        <button
          @click="joinClass"
          class="bg-green-600 text-white px-4 py-2 rounded"
        >
          Join Class
        </button>
        <button
          @click="leaveClass"
          class="bg-red-600 text-white px-4 py-2 rounded"
        >
          Leave Class
        </button>
      </div>
    </div>
  </div>
</template>
