alert("JS działa!");
console.log("Skrypt game.js załadowany.");


import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, get, update, onValue, push, remove, off } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
  // WKLEJ TUTAJ SWOJE DANE Z FIREBASE
  apiKey: "AIzaSyBeSs0i1oKNUeEbCCi8mWEs6WfxukWAebA",
  authDomain: "quisent-8b6cd.firebaseapp.com",
  databaseURL: "https://quisent-8b6cd-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "quisent-8b6cd",
  storageBucket: "quisent-8b6cd.firebasestorage.app",
  messagingSenderId: "537252295249",
  appId: "1:537252295249:web:7174d90b51d794ef973e70"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

let currentUser = null, currentRoomId = null, currentRoomData = null, dbQuestions = [], myLocalProgress = 0, myLocalScore = 0;

// --- Debugowanie na ekranie ---
function debugLog(msg) {
    const log = document.getElementById('debug-log');
    if(log) { log.innerHTML += `<br>> ${msg}`; log.scrollTop = log.scrollHeight; }
    console.log(msg);
}

window.switchScreen = (screenId) => {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
};

async function fetchQuestions() {
    try {
        const response = await fetch('questions.json');
        dbQuestions = await response.json();
        debugLog("Pytania załadowane: " + dbQuestions.length);
    } catch (e) { debugLog("BŁĄD PYTAŃ: " + e.message); }
}

// --- Autentykacja ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const snap = await get(ref(db, 'users/' + user.uid));
        currentUser = { uid: user.uid, ...snap.val() };
        document.getElementById('nav-username').innerText = currentUser.username;
        document.getElementById('navbar').classList.remove('hidden');
        switchScreen('screen-dashboard');
        listenToRooms();
    } else {
        switchScreen('screen-home');
    }
});

// --- Pokoje ---
function listenToRooms() {
    onValue(ref(db, 'rooms'), (snapshot) => {
        const list = document.getElementById('room-list');
        list.innerHTML = '';
        const rooms = snapshot.val() || {};
        for (const id in rooms) {
            if (rooms[id].status !== 'finished') {
                const div = document.createElement('div');
                div.className = 'room-item';
                div.innerHTML = `Pokój: ${rooms[id].hostName} (${rooms[id].category})`;
                div.onclick = () => joinRoom(id);
                list.appendChild(div);
            }
        }
    });
}

document.getElementById('btn-create-room-confirm').addEventListener('click', async () => {
    await fetchQuestions();
    const cat = document.getElementById('room-category').value;
    const pool = dbQuestions.filter(q => cat === "Wszystkie" || q.category === cat);
    if(pool.length === 0) return debugLog("Brak pytań!");

    const newRoomRef = push(ref(db, 'rooms'));
    currentRoomId = newRoomRef.key;
    await set(newRoomRef, {
        hostName: currentUser.username, status: 'open', category: cat,
        questions: pool.sort(() => 0.5 - Math.random()).slice(0, 5),
        players: { [currentUser.uid]: { username: currentUser.username, progress: 0, score: 0, status: 'waiting' } }
    });
    switchScreen('screen-room');
    listenToCurrentRoom();
});

async function joinRoom(id) {
    currentRoomId = id;
    await update(ref(db, `rooms/${id}/players/${currentUser.uid}`), { username: currentUser.username, progress: 0, score: 0, status: 'waiting' });
    switchScreen('screen-room');
    listenToCurrentRoom();
}

function listenToCurrentRoom() {
    onValue(ref(db, `rooms/${currentRoomId}`), (snap) => {
        currentRoomData = snap.val();
        if(!currentRoomData) return;
        if(currentRoomData.status === 'finished') showResults();
    });
}

// --- Quiz ---
document.getElementById('btn-start-my-quiz').addEventListener('click', () => {
    myLocalProgress = 0; myLocalScore = 0;
    switchScreen('screen-quiz');
    loadNextQuestion();
});

function loadNextQuestion() {
    const q = currentRoomData.questions[myLocalProgress];
    if (!q) return finishQuiz();
    
    document.getElementById('quiz-question-text').innerText = q.question;
    const cont = document.getElementById('quiz-answer-buttons');
    cont.innerHTML = '';
    q.options.forEach(opt => {
        const btn = document.createElement('button');
        btn.innerText = opt;
        btn.onclick = async () => {
            if(opt === q.answer) myLocalScore++;
            myLocalProgress++;
            await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { progress: myLocalProgress, score: myLocalScore });
            loadNextQuestion();
        };
        cont.appendChild(btn);
    });
}

async function finishQuiz() {
    await update(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`), { status: 'completed' });
    const all = Object.values(currentRoomData.players).every(p => p.status === 'completed');
    if (all) await update(ref(db, `rooms/${currentRoomId}`), { status: 'finished' });
    switchScreen('screen-results');
}

function showResults() {
    switchScreen('screen-results');
    const players = Object.values(currentRoomData.players).sort((a,b) => b.score - a.score);
    document.getElementById('final-leaderboard').innerHTML = players.map(p => `<div>${p.username}: ${p.score}</div>`).join('');
}

document.getElementById('btn-leave-room').addEventListener('click', async () => {
    off(ref(db, `rooms/${currentRoomId}`));
    await remove(ref(db, `rooms/${currentRoomId}/players/${currentUser.uid}`));
    switchScreen('screen-dashboard');
});
