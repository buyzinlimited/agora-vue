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
const UID = 0;
// ----------------------------------------

const localVideo = ref(null);
const client = AgoraRTC.createClient({ mode: "rtc", codec: "vp8" });
let screenTrack = null;

// ---------------- LOAD USERS ----------------
onMounted(async () => {
  const res = await fetch("/users.json");
  const data = await res.json();
  meetStore.instructor = data.instructor;
  meetStore.students = data.students;

  if (CHANNEL) {
    joinChannel(); // call join function automatically
  }
});

// ---------------- JOIN CHANNEL ----------------
const joinChannel = async () => {
  try {
    const uid = await client.join(APP_ID, CHANNEL, TOKEN, UID);
    console.log("Joined with UID:", uid);

    // --- Microphone track ---
    meetStore.localAudioTrack = await AgoraRTC.createMicrophoneAudioTrack();

    // --- Camera track ---
    meetStore.localVideoTrack = await AgoraRTC.createCameraVideoTrack();
    meetStore.localVideoTrack.play(localVideo.value);

    // --- Publish local tracks ---
    await client.publish([
      meetStore.localAudioTrack,
      meetStore.localVideoTrack,
    ]);

    // --- Handle remote users ---

    // Declare event handler for "user-published"
    client.on("user-published", async (user, mediaType) => {
      // Subscribe to the user's media
      await client.subscribe(user, mediaType);

      // Add user to remoteUsers if not already there
      if (!meetStore.remoteUsers.includes(user.uid)) {
        meetStore.remoteUsers.push(user.uid);
      }

      // Handle video
      if (mediaType === "video") {
        // Play the remote video track in a DOM element with ID "remote-<user.uid>"
        setTimeout(() => user.videoTrack.play("remote-" + user.uid), 100);
      }

      // Handle audio
      if (mediaType === "audio") {
        user.audioTrack.play();
      }
    });

    // Handle the "user-unpublished" event to remove the user's media
    client.on("user-unpublished", (user, mediaType) => {
      // Remove user from remoteUsers if video is unpublished
      if (mediaType === "video") {
        meetStore.remoteUsers = meetStore.remoteUsers.filter(
          (id) => id !== user.uid
        );
      }

      // Stop audio if audio track is unpublished
      if (mediaType === "audio" && user.audioTrack) {
        user.audioTrack.stop();
      }

      // Stop video if video track is unpublished
      if (mediaType === "video" && user.videoTrack) {
        user.videoTrack.stop();
      }
    });
  } catch (err) {
    console.error("JOIN ERROR:", err);
  }
};

// ---------------- LEAVE MEET ----------------
const leaveChannel = async () => {
  if (meetStore.localAudioTrack) meetStore.localAudioTrack.close();
  if (meetStore.localVideoTrack) meetStore.localVideoTrack.close();
  if (screenTrack) screenTrack.close();

  await client.leave();
  meetStore.remoteUsers = [];
};

// ---------------- MIC / CAMERA ----------------
const toggleMic = () => {
  if (!meetStore.localAudioTrack) return;
  const enabled = meetStore.localAudioTrack.enabled;
  meetStore.localAudioTrack.setEnabled(!enabled);
};

const toggleCamera = () => {
  if (!meetStore.localVideoTrack) return;
  const enabled = meetStore.localVideoTrack.enabled;
  meetStore.localVideoTrack.setEnabled(!enabled);
};

// ---------------- SCREEN SHARE ----------------
const startScreenShare = async () => {
  if (!client) return;

  screenTrack = await AgoraRTC.createScreenVideoTrack({}, "auto");

  // Unpublish camera, publish screen
  await client.unpublish(meetStore.localVideoTrack);
  await client.publish(screenTrack);
  screenTrack.play(localVideo.value);

  screenTrack.on("track-ended", async () => {
    await client.unpublish(screenTrack);
    await client.publish(meetStore.localVideoTrack);
    meetStore.localVideoTrack.play(localVideo.value);
    screenTrack = null;
  });
};

// ---------------- SHARE LINK ----------------
const shareMeet = () => {
  const url = `${window.location.origin}/meet?channel=${CHANNEL}&token=${TOKEN}`;
  navigator.clipboard.writeText(url);
  alert("Meet link copied: " + url);
};

onBeforeUnmount(leaveChannel);
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
        <p class="font-semibold text-lg">{{ meetStore.instructor?.name }}</p>
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
          :disabled="!meetStore.localVideoTrack"
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
          @click="joinChannel"
          class="bg-green-600 text-white px-4 py-2 rounded"
        >
          Join
        </button>
        <button
          @click="leaveChannel"
          class="bg-red-600 text-white px-4 py-2 rounded"
        >
          Leave
        </button>
        <button
          @click="shareMeet"
          class="bg-blue-500 text-white px-4 py-2 rounded"
        >
          Share Link
        </button>
      </div>
    </div>
  </div>
</template>
