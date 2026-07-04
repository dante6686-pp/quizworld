import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, push } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// =========================================================
// WAŻNE: TUTAJ WKLEJ SWOJĄ KONFIGURACJĘ Z KONSOLI FIREBASE
// =========================================================
const firebaseConfig = {
  apiKey: "AIzaSyBeSs0i1oKNUeEbCCi8mWEs6WfxukWAebA",
  authDomain: "quisent-8b6cd.firebaseapp.com",
  databaseURL: "https://quisent-8b6cd-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "quisent-8b6cd",
  storageBucket: "quisent-8b6cd.firebasestorage.app",
  messagingSenderId: "537252295249",
  appId: "1:537252295249:web:7174d90b51d794ef973e70",
  measurementId: "G-KL93NQKPZ3"
};
// =========================================================

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// --- ZMIENNE GLOBALNE ---
let currentUser = null;
let currentRoomId = null;
let currentRoomData = null; 
let selectedAvatar = '👨‍🚀';

let dbQuestions = [];
let myLocalProgress = 0;
let myLocalScore = 0;
let roomQuestions = [];

// --- NARZĘDZIA ---
function switchScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.remove('hidden');
    document.getElementById(screenId).classList.add('active');
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

async function fetchQuestions() {
    if(dbQuestions.length > 0) return;
    try {
        const response = await fetch('questions.json');
        dbQuestions = await response.json();
    } catch (error) {
        console.error("Błąd bazy pytań:", error);
        dbQuestions = [{ question: "Błąd ładowania bazy.", answer: "Brak", hint: "Brak", category: "System" }];
    }
}

// --- UI LOGOWANIA / REJESTRACJI ---
document.querySelectorAll('.avatar-option').forEach(el => {
    el.addEventListener('click', (e) => {
        document.querySelectorAll('.avatar-option').forEach(a => a.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedAvatar = e.target.getAttribute('data-avatar');
    });
});

document.getElementById('link-register').addEventListener('click', () => {
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
});

document.getElementById('btn-cancel-register').addEventListener('click', () => {
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
});

document.getElementById('btn-register').addEventListener('click', async () => {
    const email = document.getElementById('reg-email').value.trim();
    const pass = document.getElementById('reg-pass').value;
    const username = document.getElementById('reg-username').value.trim();
    const tagline = document.getElementById('reg-tagline').value.trim();

    if(!email || !pass || !username) { alert("Wypełnij wymagane pola!"); return; }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
        const user = userCredential.user;
        await set(ref(db, 'users/' + user.uid), { username, avatar: selectedAvatar, tagline, currency: 0 });
        alert("Konto założone!");
        document.getElementById('btn-cancel-register').click(); 
    } catch (error) { alert("Błąd: " + error.message); }
});

document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value.trim();
    const pass = document.getElementById('auth-pass').value;
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        const snapshot = await get(ref(db, 'users/' + userCredential.user.uid));
        if(snapshot.exists()) {
            currentUser = { uid: userCredential.user.uid, ...snapshot.val() };
            updateNavbar();
            switchScreen('screen-dashboard');
            listenToAllRooms();
        }
    } catch (error) { alert("Błędny email lub hasło!"); }
});

function updateNavbar() {
    document.getElementById('navbar').classList.remove('hidden');
    document.getElementById('nav-avatar').innerText = currentUser.avatar;
    document.getElementById('nav-username').innerText = currentUser.username;
}

document.getElementById('btn-logout').addEventListener('click', async () => {
    await signOut(auth);
    location.reload();
});

// --- LISTA POKOI ---
function listenToAllRooms() {
    onValue(ref(db, 'rooms'), (snapshot) => {
        const roomList = document.getElementById('room-list');
        roomList.innerHTML = '';
        if (!snapshot.exists()) return;

        const rooms = snapshot.val();
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (!room || room.status === 'finished') continue; // Ignorujemy zakończone
            
            const playersCount = room.players ? Object.keys(room.players).length : 0;
            const isFull = playersCount >= room.maxPlayers;
            
            const roomDiv = document.createElement('div');
            roomDiv.className = 'room-item';
            roomDiv.innerHTML = `
                <div class="room-info">
                    <span class="room-title">Pokój: ${room.hostName}</span>
                    <span class="room-meta">Kategoria: ${room.category} | ${playersCount}/${room.maxPlayers} graczy</span>
                </div>
            `;
            roomDiv.addEventListener('click', () => joinRoom(roomId, room, isFull));
            roomList.appendChild(roomDiv);
        }
    });
}

// --- TWORZENIE POKOJU ---
document.getElementById('btn-show-create-room').addEventListener('click', () => switchScreen('screen-create-room'));
document.getElementById('btn-back-dashboard').addEventListener('click', () => switchScreen('screen-dashboard'));

document.getElementById('btn-create-room-confirm').addEventListener('click', async () => {
    await fetchQuestions();
    const category = document.getElementById('room-category').value;
    const qCount = parseInt(document.getElementById('room-q-count').value);
    
    let pool = dbQuestions.filter(q => category === "Wszystkie" || q.category === category);
    shuffleArray(pool);
    const selectedQuestions = pool.slice(0, Math.min(qCount, pool.length));

    const newRoomRef = push(ref(db, 'rooms')); 
    currentRoomId = newRoomRef.key;
    await set(newRoomRef, {
        hostName: currentUser.username,
        status: 'open',
        category,
        questionCount: selectedQuestions.length,
        questions: selectedQuestions,
        maxPlayers: parseInt(document.getElementById('room-max-players').value),
        players: { [currentUser.uid]: { username: currentUser.username, avatar: currentUser.avatar, progress: 0, score: 0, status: 'waiting' } }
    });
    switchScreen('screen-room');
    listenToCurrentRoom();
});

// --- DOŁĄCZANIE ---
async function joinRoom(roomId, roomData, isFull) {
    if (isFull && !roomData.players[currentUser.uid]) return alert("Pełny!");
    currentRoomId = roomId;
    if (!roomData.players[currentUser.uid]) {
        await update(ref(db, `rooms/${roomId}/players/${currentUser.uid}`), {
            username: currentUser.username, avatar: currentUser.avatar, progress: 0, score: 0, status: 'waiting'
        });
    }
    switchScreen('screen-room');
    listenToCurrentRoom();
}

// --- POCZEKALNIA I GRA ---
function listenToCurrentRoom() {
    onValue(ref(db, `rooms/${currentRoomId}`), (snapshot) => {
        if(!snapshot.exists()) return;
        currentRoomData = snapshot.val();
        
        // Render tabeli graczy
        const list = document.getElementById('room-players-list');
        if(list) {
            list.innerHTML = '';
            for (const pid in currentRoomData.players) {
                const p = currentRoomData.players[pid];
                list.innerHTML += `<div class="player-row"><span>${p.avatar} ${p.username}</span><span>${p.status === 'completed' ? 'Ukończono' : p.progress + '/' + currentRoomData.questionCount}</span></div>`;
            }
        }

        // Czy wszyscy skończyli?
        const allFinished = Object.values(currentRoomData.players).every(p => p.status === 'completed');
        if (allFinished && currentRoomData.status !== 'finished') {
            update(ref(db, `rooms/${currentRoomId}`), { status: 'finished' });
        }
        
        if (currentRoomData.status === 'finished') {
            switchScreen('screen-results');
            document.getElementById('waiting-message').classList.add('hidden');
            document.getElementById('podium-container').classList.remove('hidden');
            renderRealLeaderboard(Object.values(currentRoomData.players));
        }
    });
}

document.getElementById('btn-start-my-quiz').addEventListener('click', async () => {
    roomQuestions = currentRoomData.questions;
    myLocalProgress = currentRoomData.players[currentUser.uid].progress || 0;
    await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { status: 'in_progress' });
    switchScreen('screen-quiz');
    loadNextAsyncQuestion();
});

function loadNextAsyncQuestion() {
    if (myLocalProgress >= roomQuestions.length) {
        update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { status: 'completed', progress: roomQuestions.length });
        switchScreen('screen-results');
        return;
    }
    document.getElementById('quiz-question-text').innerText = roomQuestions[myLocalProgress].question;
    document.getElementById('quiz-real-answer').innerText = roomQuestions[myLocalProgress].answer;
}

// Obsługa przycisków testowych
document.getElementById('test-btn-correct').addEventListener('click', async () => {
    myLocalScore++; myLocalProgress++;
    await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { progress: myLocalProgress, score: myLocalScore });
    loadNextAsyncQuestion();
});

document.getElementById('test-btn-wrong').addEventListener('click', async () => {
    myLocalProgress++;
    await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { progress: myLocalProgress });
    loadNextAsyncQuestion();
});

function renderRealLeaderboard(players) {
    players.sort((a, b) => b.score - a.score);
    const list = document.getElementById('final-leaderboard');
    list.innerHTML = players.map((p, i) => `<div class="player-row"><span>${i+1}. ${p.username}</span><span>${p.score} pkt</span></div>`).join('');
}

document.getElementById('btn-leave-room').addEventListener('click', () => switchScreen('screen-dashboard'));
document.getElementById('btn-return-to-dash').addEventListener('click', () => switchScreen('screen-dashboard'));
