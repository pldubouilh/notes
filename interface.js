let root = document.documentElement;
const textarea = document.getElementById('main')
const search = document.getElementById('search')
const sidebar = document.getElementsByTagName('sidebar')[0]
const list = document.getElementsByTagName('list')[0]
const toggle = document.getElementsByTagName('toggle')[0]
const night = document.getElementsByTagName('night')[0]
const add = document.getElementsByTagName('add')[0]
const passEl = document.getElementById('pass')

let notes = []
let iv;
let salt;
let key;
let fileHandle = null

let current = localStorage.getItem('currentnote')

const newNote = () => {
    let id = [...Array(30)].map(() => Math.random().toString(36)[2]).join('')
    notes.unshift({
        title: "new note",
        id,
        content: '',
        timestamp: new Date().toLocaleDateString("de-DE")
    })
    refreshSideBar()
    switchTo(id)
    search.value = ''
    enableEditor()
    dirty = true
}


const switchTo = (index) => {
    current = index
    textarea.value = notes.find(note => note.id == index).content
    document.querySelector(".highlight")?.classList.remove("highlight")
    document.querySelector(`[data-index="${index}"]`)?.classList.add("highlight")
}

const deleteNote = (target) => {
    if (!confirm('delete this note?')) {
        return
    }

    let targetIsCurrent = target === current
    if (targetIsCurrent) {
        current = null
    }

    let targetIndex = notes.findIndex(note => note.id == target)
    notes.splice(targetIndex, 1);

    if (search.value.length > 0) {
        searchNotes()
    } else {
        refreshSideBar()
        if (targetIsCurrent) {
            switchTo(notes[0].id)
        }
    }
}

let dirty = false
const saveNotes = async () => {
    if (!dirty) {
        return
    }
    dirty = false;
    localStorage.setItem('currentnote', current)
    const writable = await fileHandle.createWritable();
    const encrypted = await encrypt()
    await writable.write(encrypted);
    await writable.close();
}

const toggleSidebar = () => {
    sidebar.style.display = sidebar.style.display === 'block' ? 'none' : 'block'
    textarea.style.width = sidebar.style.display === 'block' ? '80%' : '100%'
}


const setTheme = () => {
    if (localStorage.theme === 'night') {
        root.style.setProperty('--background-color', "#20222B");
        root.style.setProperty('--font-color', "#EFEFEF");
        root.style.setProperty('--highlight-font-color', "white");
        night.innerHTML = '☀️'
    } else {
        root.style.setProperty('--background-color', "#EFEFEF");
        root.style.setProperty('--font-color', "#333");
        root.style.setProperty('--highlight-font-color', "black");
        night.innerHTML = '🌚'
    }
}

const toggleTheme = () => {
    localStorage.theme = localStorage.theme === 'night' ? 'day' : 'night'
    setTheme()
}

setTheme()

const refreshSideBar = (target) => {
    let notesSelected = target || notes
    let html = ''
    for (let note of notesSelected) {
        let highlight = note.id === current ? 'highlight' : ''
        html += `<div>
                    <p class="listel">
                        <span class="${highlight}" onclick="switchTo('${note.id}')" data-index="${note.id}">${note.title}</span>
                        <svg fill="gray" onclick="deleteNote('${note.id}')" width="16" height="16" viewBox="0 0 24 24"> <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/> </svg>
                    </p>
                    <p onclick="switchTo('${note.id}')" class="ts">${note.timestamp}</p>
                </div>`
    }
    list.innerHTML = html
}

const loadFile = async (newFile) => {
    let pass = passEl.value
    if (!!!pass || pass.length < 0) {
        alert('enter password first')
        return
    }

    if (newFile && !confirm('create new file?')) {
        return
    }

    const opts = {
        types: [{ description: 'Text Files', accept: { 'text/plain': ['.txt'], }, },],
        excludeAcceptAllOption: true,
        suggestedName: 'notes.txt',
        multiple: false,
    };

    if (newFile) {
        fileHandle = await window.showSaveFilePicker(opts);
        await newfile(pass)
    } else {
        [fileHandle] = await window.showOpenFilePicker(opts);

        try {
            const file = await fileHandle.getFile();
            const raw = await file.arrayBuffer()
            notes = await decrypt(raw, pass)
        } catch (e) {
            console.log(e)
            alert('invalid file, or incorrect password')
            return
        }
    }

    const _ = await fileHandle.createWritable();

    document.getElementsByTagName('overlay')[0].style.display = 'none'
    if (notes.length === 0) {
        newNote()
    } else {
        switchTo(current)
    }

    refreshSideBar()
    window.addEventListener('beforeunload', saveNotes, true)
    setInterval(saveNotes, 2000)
}

document.getElementsByTagName('newfile')[0].addEventListener('click', async e => loadFile(true))
document.getElementsByTagName('openfile')[0].addEventListener('click', async e => loadFile(false))
toggle.addEventListener('click', toggleSidebar)
night.addEventListener('click', toggleTheme)
add.addEventListener('click', newNote)

const disableEditor = () => {
    current = null
    textarea.value = ''
    textarea.placeholder = 'no results'
    textarea.setAttribute('disabled', true)
}

const enableEditor = () => {
    textarea.removeAttribute('disabled')
    textarea.placeholder = 'start typing'
}

const searchNotes = () => {
    let query = search.value.toLowerCase()
    let results = notes.filter(note => {
        return note.title.toLowerCase().includes(query) ||
            note.timestamp.toLowerCase().includes(query) ||
            note.content.toLowerCase().includes(query)
    })

    refreshSideBar(results)

    if (results.length == 0) {
        disableEditor()
    } else {
        enableEditor()
        switchTo(results[0].id)
    }
}

search.addEventListener('keyup', searchNotes)

textarea.addEventListener('keyup', e => {
    dirty = true;

    if (e.ctrlKey && e.key === 's') {
        e.preventDefault()
        return
    }

    let note = notes.find(note => note.id == current)
    if (!note) {
        return
    }
    note.content = textarea.value

    // update title
    let first = textarea.value.split('\n')[0].replace('#', '')
    if (first.length == 0) {
        first = "new note"
    }
    if (first !== note.title) {
        document.querySelector(`[data-index="${current}"]`).innerHTML = first
        note.title = first
    }
})

async function newfile(pass) {
    iv = window.crypto.getRandomValues(new Uint8Array(128))
    salt = window.crypto.getRandomValues(new Uint8Array(128))
    key = await derivePasswordPbkdf2(pass)
}

async function encrypt() {
    const pl = new TextEncoder().encode(JSON.stringify(notes))
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, pl)
    var u8encrypted = new Uint8Array(encrypted);
    let stored = new Uint8Array(256 + u8encrypted.length)
    stored.set(salt, 0)
    stored.set(iv, 128)
    stored.set(u8encrypted, 256)
    return stored
}

async function decrypt(pl, pass) {
    var u8pl = new Uint8Array(pl);
    salt = u8pl.slice(0, 128)
    iv = u8pl.slice(128, 256)
    let encrypted = u8pl.slice(256)
    key = await derivePasswordPbkdf2(pass)
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv}, key, encrypted)
    return JSON.parse(new TextDecoder().decode(decrypted))
}

const derivePasswordPbkdf2 = async (password) => {
    const iterations = 600000
    const keylen = 32
    const digest = 'SHA-256'

    let bk =  await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );

    const k = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations,
            hash: digest
        },
        bk,
        { name: 'AES-GCM', length: keylen * 8 },
        true,
        ['encrypt', 'decrypt']
    )
    return k;
}

if ("serviceWorker" in navigator) {
    window.addEventListener("load", function() {
      navigator.serviceWorker
        .register("sw.js")
        .then(res => console.log("service worker registered"))
        .catch(err => console.log("service worker not registered", err))
    })
}

if (!("showOpenFilePicker" in window)) {
    alert("unsupported browser")
}