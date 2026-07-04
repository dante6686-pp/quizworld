import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, push, remove, off } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBeSs0i1oKNUeEbCCi8mWEs6WfxukWAebA",
  authDomain: "quisent-8b6cd.firebaseapp.com",
  databaseURL: "https://quisent-8b6cd-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "quisent-8b6cd",
  storageBucket: "quisent-8b6cd.firebasestorage.app",
  messagingSenderId: "537252295249",
  appId: "1:537252295249:web:7174d90b51d794ef973e70",
  measurementId: "G-KL93NQKPZ3" };
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentUser = null, currentRoomId = null, currentRoomData = null, myLocalProgress = 0, myLocalScore = 0, roomQuestions = [];

window.switchScreen = (screenId) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
};

// Sprawdzenie stanu logowania
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const snap = await get(ref(db, 'users/' + user.uid));
        currentUser = { uid: user.uid, ...snap.val() };
        document.getElementById('nav-username').innerText = currentUser.username;
        document.getElementById('nav-avatar').innerText = currentUser.avatar;
        document.getElementById('navbar').classList.remove('hidden');
        switchScreen('screen-dashboard');
        listenToRooms('room-list');
    } else {
        switchScreen('screen-home');
        listenToRooms('home-room-list');
    }
});

function listenToRooms(containerId) {
    onValue(ref(db, 'rooms'), (snapshot) => {
        const list = document.getElementById(containerId);
        list.innerHTML = '';
        const rooms = snapshot.val() || {};
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (room.status === 'finished') continue;
            const div = document.createElement('div');
            div.className = 'room-item';
            div.innerHTML = `Pokój: ${room.hostName} | ${room.category}`;
            div.onclick = () => {
                if(!currentUser) return alert("Zaloguj się!");
                joinRoom(roomId);
            };
            list.appendChild(div);
        }
    });
}

async function joinRoom(roomId) {
    currentRoomId = roomId;
    await update(ref(db, `rooms/${roomId}/players/${currentUser.uid}`), {
        username: currentUser.username, avatar: currentUser.avatar, progress: 0, score: 0, status: 'waiting'
    });
    switchScreen('screen-room');
    onValue(ref(db, `rooms/${roomId}`), (snap) => {
        currentRoomData = snap.val();
        if(currentRoomData.status === 'finished') showResults();
    });
}

document.getElementById('btn-leave-room').addEventListener('click', async () => {
    off(ref(db, `rooms/${currentRoomId}`));
    await remove(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`));
    currentRoomId = null;
    switchScreen('screen-dashboard');
});

function showResults() {
    switchScreen('screen-results');
    document.getElementById('podium-container').classList.remove('hidden');
    const players = Object.values(currentRoomData.players).sort((a,b) => b.score - a.score);
    document.getElementById('final-leaderboard').innerHTML = players.map(p => 
        `<div class="player-row">${p.username}: ${p.score} pkt</div>`).join('');
}

document.getElementById('btn-login').addEventListener('click', async () => {
    try {
        await signInWithEmailAndPassword(auth, document.getElementById('auth-email').value, document.getElementById('auth-pass').value);
    } catch(e) { alert("Błąd logowania"); }
});

document.getElementById('btn-return-to-dash').addEventListener('click', () => switchScreen('screen-dashboard'));
