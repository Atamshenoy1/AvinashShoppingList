// === Configuration & State ===
const API_BASE = '/api';
const OPEN_FOOD_FACTS_API = 'https://world.openfoodfacts.org/api/v0/product/';

let currentListId = null;
let html5QrcodeScanner = null;

// === DOM Elements ===
const shareListBtn = document.getElementById('shareListBtn');
const shareBanner = document.getElementById('shareBanner');
const shareLinkInput = document.getElementById('shareLinkInput');
const copyShareLinkBtn = document.getElementById('copyShareLinkBtn');

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

async function initApp() {
    setupEventListeners();
    await initializeList();
}

function setupEventListeners() {
    // Sharing
    shareListBtn.addEventListener('click', toggleShareBanner);
    copyShareLinkBtn.addEventListener('click', copyShareLink);

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

// === List Management ===
async function initializeList() {
    // Check URL parameters for an existing list ID
    const urlParams = new URLSearchParams(window.location.search);
    const idFromUrl = urlParams.get('list');

    if (idFromUrl) {
        currentListId = idFromUrl;
        await fetchAndRenderListItems();
    } else {
        // Create a new list and update URL
        await createNewList();
    }

    // Set up share link input
    const shareUrl = `${window.location.origin}${window.location.pathname}?list=${currentListId}`;
    shareLinkInput.value = shareUrl;
}

async function createNewList() {
    try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/lists`, { method: 'POST' });
        const data = await response.json();
        
        if (data.id) {
            currentListId = data.id;
            // Update URL without reloading
            const newUrl = `${window.location.pathname}?list=${currentListId}`;
            window.history.pushState({ path: newUrl }, '', newUrl);
            renderEmptyState();
        }
    } catch (error) {
        console.error('Error creating list:', error);
        alert('Failed to create a new list. Please check your connection.');
    } finally {
        setLoading(false);
    }
}

async function fetchAndRenderListItems() {
    try {
        setLoading(true);
        const response = await fetch(`${API_BASE}/lists/${currentListId}/items`);
        const items = await response.json();
        
        renderItems(items);
        
        // Polling for updates (simple real-time sync mechanism)
        // In a production app, WebSockets would be better, but polling is fine here
        setInterval(pollForChanges, 5000);
        
    } catch (error) {
        console.error('Error fetching items:', error);
    } finally {
        setLoading(false);
    }
}

async function pollForChanges() {
    if (!currentListId) return;
    try {
        const response = await fetch(`${API_BASE}/lists/${currentListId}/items`);
        const items = await response.json();
        // Simple re-render to catch external changes
        // A more sophisticated app would compute differences
        renderItems(items);
    } catch (error) {
        // Silently fail polling
    }
}

// === Item Operations ===
async function addItem(name, imageUrl) {
    try {
        const response = await fetch(`${API_BASE}/lists/${currentListId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, image_url: imageUrl })
        });
        
        if (response.ok) {
            await pollForChanges(); // Refresh list to get the new item with its ID
        }
    } catch (error) {
        console.error('Error adding item:', error);
        alert('Failed to add item.');
    }
}

async function toggleItemState(itemId, currentCheckedStatus) {
    try {
        await fetch(`${API_BASE}/items/${itemId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ checked: !currentCheckedStatus })
        });
        await pollForChanges();
    } catch (error) {
        console.error('Error updating item:', error);
    }
}

async function deleteItem(itemId) {
    try {
        await fetch(`${API_BASE}/items/${itemId}`, {
            method: 'DELETE'
        });
        await pollForChanges();
    } catch (error) {
        console.error('Error deleting item:', error);
    }
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
            
            await addItem(productName, imageUrl);
            
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

async function handleManualAdd(e) {
    e.preventDefault();
    const name = itemNameInput.value.trim();
    const imageUrl = itemImageInput.value.trim();
    
    if (name) {
        await addItem(name, imageUrl);
        closeManualModal();
    }
}

// === UI Rendering ===
function renderItems(items) {
    shoppingListEl.innerHTML = '';
    
    if (!items || items.length === 0) {
        renderEmptyState();
        return;
    }
    
    emptyStateEl.style.display = 'none';
    
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
        checkbox.addEventListener('change', () => toggleItemState(item.id, item.checked));
        
        const deleteBtn = li.querySelector('.delete-btn');
        deleteBtn.addEventListener('click', () => deleteItem(item.id));
        
        shoppingListEl.appendChild(li);
    });
}

function renderEmptyState() {
    shoppingListEl.innerHTML = '';
    emptyStateEl.style.display = 'flex';
}

function setLoading(isLoading) {
    if (isLoading) {
        loadingIndicator.style.display = 'flex';
        emptyStateEl.style.display = 'none';
        shoppingListEl.style.display = 'none';
    } else {
        loadingIndicator.style.display = 'none';
        shoppingListEl.style.display = 'flex';
    }
}

// === Utility ===
function toggleShareBanner() {
    const isHidden = shareBanner.style.display === 'none';
    shareBanner.style.display = isHidden ? 'block' : 'none';
}

function copyShareLink() {
    shareLinkInput.select();
    shareLinkInput.setSelectionRange(0, 99999); // For mobile devices
    
    try {
        navigator.clipboard.writeText(shareLinkInput.value)
            .then(() => {
                const originalText = copyShareLinkBtn.textContent;
                copyShareLinkBtn.textContent = 'Copied!';
                copyShareLinkBtn.classList.add('success');
                setTimeout(() => {
                    copyShareLinkBtn.textContent = originalText;
                    copyShareLinkBtn.classList.remove('success');
                }, 2000);
            });
    } catch (err) {
        // Fallback for older browsers
        document.execCommand("copy");
    }
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
