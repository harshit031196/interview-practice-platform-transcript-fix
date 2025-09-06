// Configuration - Update this URL to your deployed Cloud Function
const CLOUD_FUNCTION_URL = 'https://your-region-your-project-id.cloudfunctions.net/generate_upload_url';

// DOM elements
const fileInput = document.getElementById('fileInput');
const uploadButton = document.getElementById('uploadButton');
const statusElement = document.getElementById('status');
const fileInfoElement = document.getElementById('fileInfo');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');

// File input change handler
fileInput.addEventListener('change', handleFileSelection);
uploadButton.addEventListener('click', handleUpload);

/**
 * Handle file selection and display file information
 */
function handleFileSelection() {
    const file = fileInput.files[0];
    
    if (file) {
        // Display file information
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        fileInfoElement.innerHTML = `
            <strong>Selected:</strong> ${file.name}<br>
            <strong>Size:</strong> ${fileSizeMB} MB<br>
            <strong>Type:</strong> ${file.type}
        `;
        fileInfoElement.style.display = 'block';
        uploadButton.disabled = false;
        
        // Clear previous status
        updateStatus('', '');
    } else {
        fileInfoElement.style.display = 'none';
        uploadButton.disabled = true;
    }
}

/**
 * Update status display with appropriate styling
 * @param {string} message - Status message to display
 * @param {string} type - Status type: 'info', 'success', 'error', or ''
 */
function updateStatus(message, type) {
    statusElement.textContent = message;
    statusElement.className = type ? `status-${type}` : '';
    
    if (type === 'info') {
        progressBar.style.display = 'block';
    } else {
        progressBar.style.display = 'none';
        progressFill.style.width = '0%';
    }
}

/**
 * Update progress bar
 * @param {number} percentage - Progress percentage (0-100)
 */
function updateProgress(percentage) {
    progressFill.style.width = `${percentage}%`;
}

/**
 * Main upload handler - orchestrates the two-step upload process
 */
async function handleUpload() {
    // Get the selected file
    const file = fileInput.files[0];
    
    if (!file) {
        updateStatus('Please select a video file first.', 'error');
        return;
    }
    
    // Validate file type
    if (!file.type.startsWith('video/')) {
        updateStatus('Please select a valid video file.', 'error');
        return;
    }
    
    // Disable upload button during process
    uploadButton.disabled = true;
    
    try {
        updateStatus('Preparing upload...', 'info');
        updateProgress(10);
        
        // Step 1: Get signed URL from backend
        const signedUrl = await getSignedUrl(file.name, file.type);
        
        updateStatus('Uploading video...', 'info');
        updateProgress(30);
        
        // Step 2: Upload file to Google Cloud Storage
        await uploadFileToGCS(signedUrl, file);
        
        updateStatus('Upload successful! 🎉', 'success');
        updateProgress(100);
        
        // Reset form after successful upload
        setTimeout(() => {
            resetForm();
        }, 3000);
        
    } catch (error) {
        console.error('Upload failed:', error);
        updateStatus(`Upload failed: ${error.message}`, 'error');
    } finally {
        uploadButton.disabled = false;
    }
}

/**
 * Step 1: Get signed URL from the backend Cloud Function
 * @param {string} filename - Name of the file to upload
 * @param {string} contentType - MIME type of the file
 * @returns {Promise<string>} - The signed URL for uploading
 */
async function getSignedUrl(filename, contentType) {
    try {
        updateProgress(20);
        
        const response = await fetch(CLOUD_FUNCTION_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                filename: filename,
                contentType: contentType
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data.signedUrl) {
            throw new Error('No signed URL received from server');
        }
        
        console.log('Signed URL generated successfully');
        return data.signedUrl;
        
    } catch (error) {
        console.error('Failed to get signed URL:', error);
        throw new Error(`Failed to get upload permission: ${error.message}`);
    }
}

/**
 * Step 2: Upload file directly to Google Cloud Storage using signed URL
 * @param {string} signedUrl - The signed URL for uploading
 * @param {File} file - The file object to upload
 */
async function uploadFileToGCS(signedUrl, file) {
    try {
        updateProgress(50);
        
        const response = await fetch(signedUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': file.type
            },
            body: file
        });
        
        updateProgress(90);
        
        if (!response.ok) {
            const errorText = await response.text().catch(() => 'Unknown error');
            throw new Error(`Upload failed: HTTP ${response.status} - ${errorText}`);
        }
        
        console.log('File uploaded successfully to Google Cloud Storage');
        
    } catch (error) {
        console.error('Failed to upload file to GCS:', error);
        throw new Error(`Failed to upload file: ${error.message}`);
    }
}

/**
 * Reset the form to initial state
 */
function resetForm() {
    fileInput.value = '';
    fileInfoElement.style.display = 'none';
    updateStatus('', '');
    uploadButton.disabled = true;
}

/**
 * Handle network errors and provide user-friendly messages
 */
window.addEventListener('online', () => {
    if (statusElement.textContent.includes('network')) {
        updateStatus('Connection restored. You can try uploading again.', 'info');
    }
});

window.addEventListener('offline', () => {
    updateStatus('No internet connection. Please check your network.', 'error');
});

// Initialize the form
document.addEventListener('DOMContentLoaded', () => {
    uploadButton.disabled = true;
    console.log('Video upload client initialized');
    console.log('Cloud Function URL:', CLOUD_FUNCTION_URL);
});
