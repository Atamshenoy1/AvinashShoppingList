// === Configuration & State ===
const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v0/product/';

let items = [];
let html5QrcodeScanner = null;

// === DOM Elements ===
const shoppingListEl = document.getElementById('shoppingList');
const emptyStateEl = document.getElementById('emptyState');
const loadingIndicator = document.getElementById('loadingIndicator');

const scanBarcodeBtn = document.getElementById('scanBarcodeBtn');
const manualAddBtn = document.getElementById('manualAddBtn');

const scannerModal = document.getElementById('scannerModal');
const closeScannerBtn = document.getElementById('closeScannerBtn');
const scannerStatus = document.getElementById('scannerStatus');

const manualAddModal = document.getElementById('manualAddModal');
const closeManualBtn = document.getElementById('closeManualBtn');
const manualAddForm = document.getElementById('manualAddForm');
const itemNameInput = document.getElementById('itemNameInput');
const itemImageInput = document.getElementById('itemImageInput');

// === Initialization ===
document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
    setupEventListeners();
    loadItemsFromStorage();
    renderItems();
}

function setupEventListeners() {
    // Modals
    scanBarcodeBtn.addEventListener('click', openScannerModal);
    closeScannerBtn.addEventListener('click', closeScannerModal);
    
    manualAddBtn.addEventListener('click', openManualModal);
    closeManualBtn.addEventListener('click', closeManualModal);
    
    // Close modals on outside click
    window.addEventListener('click', (e) => {
        if (e.target === scannerModal) closeScannerModal();
        if (e.target === manualAddModal) closeManualModal();
    });

    // Forms
    manualAddForm.addEventListener('submit', handleManualAdd);
}

// === List Management (Local Storage) ===
function loadItemsFromStorage() {
    const stored = localStorage.getItem('smartShoppingList');
    if (stored) {
        try {
            items = JSON.parse(stored);
        } catch (e) {
            console.error('Failed to parse local storage', e);
            items = [];
        }
    }
}

function saveItemsToStorage() {
    localStorage.setItem('smartShoppingList', JSON.stringify(items));
}

// === Item Operations ===
function addItem(name, imageUrl) {
    const newItem = {
        id: Date.now().toString(),
        name: name,
        image_url: imageUrl,
        checked: false
    };
    
    items.unshift(newItem); // Add to beginning of list
    saveItemsToStorage();
    renderItems();
}

function toggleItemState(itemId) {
    const item = items.find(i => i.id === itemId);
    if (item) {
        item.checked = !item.checked;
        saveItemsToStorage();
        renderItems();
    }
}

function deleteItem(itemId) {
    items = items.filter(i => i.id !== itemId);
    saveItemsToStorage();
    renderItems();
}

// === Barcode Scanning & API Lookup ===
function openScannerModal() {
    scannerModal.classList.add('active');
    scannerStatus.textContent = "Initializing camera...";
    
    html5QrcodeScanner = new Html5QrcodeScanner(
        "reader", 
        { fps: 10, qrbox: { width: 250, height: 150 }, aspectRatio: 1.0 }
    );
    
    html5QrcodeScanner.render(onScanSuccess, onScanFailure);
}

function closeScannerModal() {
    scannerModal.classList.remove('active');
    if (html5QrcodeScanner) {
        html5QrcodeScanner.clear().catch(error => {
            console.error("Failed to clear html5QrcodeScanner. ", error);
        });
        html5QrcodeScanner = null;
    }
}

async function onScanSuccess(decodedText, decodedResult) {
    // Prevent multiple scans of the same item rapidly
    if (html5QrcodeScanner) {
        html5QrcodeScanner.pause();
    }
    
    scannerStatus.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Looking up product: ${decodedText}...`;
    
    try {
        const response = await fetch(`${OPEN_FOOD_FACTS_API}${decodedText}.json`);
        const data = await response.json();
        
        if (data.status === 1 && data.product) {
            scannerStatus.innerHTML = `<i class='bx bx-check-circle' style='color:var(--accent)'></i> Found: ${data.product.product_name || 'Unknown Product'}`;
            
            const productName = data.product.product_name || `Item (${decodedText})`;
            const imageUrl = data.product.image_url || data.product.image_front_url || '';
            
            addItem(productName, imageUrl);
            
            setTimeout(() => {
                closeScannerModal();
            }, 1000);
        } else {
            scannerStatus.innerHTML = `Product not found. <a href="#" id="addManualFromScan">Add Manually?</a>`;
            document.getElementById('addManualFromScan').addEventListener('click', (e) => {
                e.preventDefault();
                closeScannerModal();
                openManualModal();
                itemNameInput.value = `Item ${decodedText}`;
            });
            // Resume scanning if not found
            if (html5QrcodeScanner) html5QrcodeScanner.resume();
        }
    } catch (error) {
        console.error('Error looking up barcode:', error);
        scannerStatus.textContent = "Error connecting to product database.";
        setTimeout(() => {
            if (html5QrcodeScanner) html5QrcodeScanner.resume();
        }, 2000);
    }
}

function onScanFailure(error) {
    // Ignore routine scan failures (when no barcode is in frame)
}

// === Manual Item Add ===
function openManualModal() {
    manualAddModal.classList.add('active');
    itemNameInput.focus();
}

function closeManualModal() {
    manualAddModal.classList.remove('active');
    manualAddForm.reset();
}

function handleManualAdd(e) {
    e.preventDefault();
    const name = itemNameInput.value.trim();
    const imageUrl = itemImageInput.value.trim();
    
    if (name) {
        addItem(name, imageUrl);
        closeManualModal();
    }
}

// === UI Rendering ===
function renderItems() {
    shoppingListEl.innerHTML = '';
    
    if (items.length === 0) {
        renderEmptyState();
        return;
    }
    
    emptyStateEl.style.display = 'none';
    shoppingListEl.style.display = 'flex';
    
    items.forEach(item => {
        const li = document.createElement('li');
        li.className = `list-item ${item.checked ? 'checked' : ''}`;
        
        // Image logic
        let imageHtml = '';
        if (item.image_url) {
            imageHtml = `<img class="item-image" src="${item.image_url}" alt="${item.name}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<i class=\\'bx bx-image-alt item-fallback-icon\\'></i>';">`;
        } else {
            imageHtml = `<i class='bx bx-image-alt item-fallback-icon'></i>`;
        }
        
        li.innerHTML = `
            <input type="checkbox" class="item-checkbox" ${item.checked ? 'checked' : ''}>
            <div class="item-image-wrapper">
                ${imageHtml}
            </div>
            <div class="item-details">
                <h3 class="item-name">${escapeHtml(item.name)}</h3>
            </div>
            <button class="delete-btn" aria-label="Delete item">
                <i class='bx bx-trash'></i>
            </button>
        `;
        
        // Event Listeners for the item
        const checkbox = li.querySelector('.item-checkbox');
        checkbox.addEventListener('change', () => toggleItemState(item.id));
        
        const deleteBtn = li.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => deleteItem(item.id));
        
        shoppingListEl.appendChild(li);
    });
}

function renderEmptyState() {
    shoppingListEl.innerHTML = '';
    emptyStateEl.style.display = 'flex';
}

// Simple HTML escaping to prevent XSS
function escapeHtml(unsafe) {
    return (unsafe || '').toString()
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
}
