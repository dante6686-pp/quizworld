import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, push, remove, off } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// =========================================================
// WKLEJ TUTAJ SWOJĄ KONFIGURACJĘ FIREBASE
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

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// --- ZMIENNE ---
let currentUser = null, currentRoomId = null, currentRoomData = null;
let selectedAvatar = '👨‍🚀', dbQuestions = [], myLocalProgress = 0, myLocalScore = 0, roomQuestions = [];

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
    } catch (e) { console.error("Błąd pytań:", e); }
}

// --- LOGOWANIE / REJESTRACJA ---
document.querySelectorAll('.avatar-option').forEach(el => {
    el.addEventListener('click', (e) => {
        document.querySelectorAll('.avatar-option').forEach(a => a.classList.remove('selected'));
        e.target.classList.add('selected');
        selectedAvatar = e.target.getAttribute('data-avatar');
    });
});

document.getElementById('link-register').addEventListener('click', () => {
    document.querySelector('#screen-auth').classList.add('hidden');
    document.querySelector('#register-form').classList.remove('hidden');
});

document.getElementById('btn-register').addEventListener('click', async () => {
    const email = document.getElementById('reg-email').value;
    const pass = document.getElementById('reg-pass').value;
    const username = document.getElementById('reg-username').value;
    try {
        const user = await createUserWithEmailAndPassword(auth, email, pass);
        await set(ref(db, 'users/' + user.user.uid), { username, avatar: selectedAvatar, currency: 0 });
        alert("Konto założone!");
        location.reload();
    } catch (e) { alert(e.message); }
});

document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('auth-email').value;
    const pass = document.getElementById('auth-pass').value;
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, pass);
        const snap = await get(ref(db, 'users/' + userCredential.user.uid));
        currentUser = { uid: userCredential.user.uid, ...snap.val() };
        document.getElementById('nav-username').innerText = currentUser.username;
        document.getElementById('nav-avatar').innerText = currentUser.avatar;
        document.getElementById('navbar').classList.remove('hidden');
        switchScreen('screen-dashboard');
        listenToAllRooms();
    } catch (e) { alert("Błędny email/hasło"); }
});

document.getElementById('btn-logout').addEventListener('click', async () => { await signOut(auth); location.reload(); });

// --- POKOJE ---
function listenToAllRooms() {
    onValue(ref(db, 'rooms'), (snapshot) => {
        const roomList = document.getElementById('room-list');
        roomList.innerHTML = '';
        const rooms = snapshot.val();
        for (const roomId in rooms) {
            const room = rooms[roomId];
            if (!room || room.status === 'finished' || !room.hostName) continue;
            const roomDiv = document.createElement('div');
            roomDiv.className = 'room-item';
            roomDiv.innerHTML = `<div class="room-title">Pokój: ${room.hostName}</div><div class="room-meta">${room.category}</div>`;
            roomDiv.addEventListener('click', () => joinRoom(roomId, room));
            roomList.appendChild(roomDiv);
        }
    });
}

document.getElementById('btn-show-create-room').addEventListener('click', () => switchScreen('screen-create-room'));
document.getElementById('btn-back-dashboard').addEventListener('click', () => switchScreen('screen-dashboard'));

document.getElementById('btn-create-room-confirm').addEventListener('click', async () => {
    await fetchQuestions();
    const category = document.getElementById('room-category').value;
    const qCount = parseInt(document.getElementById('room-q-count').value);
    let pool = dbQuestions.filter(q => category === "Wszystkie" || q.category === category);
    shuffleArray(pool);
    const selectedQuestions = pool.slice(0, qCount);

    const newRoomRef = push(ref(db, 'rooms')); 
    currentRoomId = newRoomRef.key;
    await set(newRoomRef, {
        hostName: currentUser.username, status: 'open', category,
        questionCount: selectedQuestions.length, questions: selectedQuestions,
        players: { [currentUser.uid]: { username: currentUser.username, avatar: currentUser.avatar, progress: 0, score: 0, status: 'waiting' } }
    });
    switchScreen('screen-room');
    listenToCurrentRoom();
});

async function joinRoom(roomId, roomData) {
    currentRoomId = roomId;
    await update(ref(db, `rooms/${roomId}/players/${currentUser.uid}`), {
        username: currentUser.username, avatar: currentUser.avatar, progress: 0, score: 0, status: 'waiting'
    });
    switchScreen('screen-room');
    listenToCurrentRoom();
}

// --- GRA ASYNCHRONICZNA ---
function listenToCurrentRoom() {
    onValue(ref(db, `rooms/${currentRoomId}`), (snapshot) => {
        if(!snapshot.exists()) return;
        currentRoomData = snapshot.val();
        
        const list = document.getElementById('room-players-list');
        list.innerHTML = Object.values(currentRoomData.players).map(p => 
            `<div class="player-row"><span>${p.avatar} ${p.username}</span><span>${p.status === 'completed' ? 'Ukończono' : p.progress + '/' + currentRoomData.questionCount}</span></div>`
        ).join('');

        if (currentRoomData.status === 'finished') {
            switchScreen('screen-results');
            document.getElementById('podium-container').classList.remove('hidden');
            const players = Object.values(currentRoomData.players).sort((a,b) => b.score - a.score);
            document.getElementById('final-leaderboard').innerHTML = players.map((p, i) => 
                `<div class="player-row"><span>${i+1}. ${p.username}</span><span>${p.score} pkt</span></div>`
            ).join('');
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
        finishMyQuiz();
        return;
    }
    const currentQ = roomQuestions[myLocalProgress];
    document.getElementById('quiz-question-text').innerText = currentQ.question;
    const container = document.getElementById('quiz-answer-buttons');
    container.innerHTML = '';
    currentQ.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.innerText = opt;
        btn.onclick = () => handleAnswer(opt === currentQ.answer);
        container.appendChild(btn);
    });
}

async function handleAnswer(isCorrect) {
    if (isCorrect) myLocalScore++;
    myLocalProgress++;
    await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { progress: myLocalProgress, score: myLocalScore });
    loadNextAsyncQuestion();
}

async function finishMyQuiz() {
    await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { status: 'completed', progress: roomQuestions.length });
    const players = Object.values(currentRoomData.players);
    if (players.every(p => p.status === 'completed')) await update(ref(db, `rooms/${currentRoomId}`), { status: 'finished' });
    switchScreen('screen-results');
}

document.getElementById('btn-leave-room').addEventListener('click', async () => {
    if (currentRoomId) {
        off(ref(db, `rooms/${currentRoomId}`));
        await remove(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`));
        location.reload();
    }
});

document.getElementById('btn-return-to-dash').addEventListener('click', () => location.reload());
