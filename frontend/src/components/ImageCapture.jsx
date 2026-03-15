import { useRef, useState } from 'react';

/**
 * ImageCapture — lets the customer upload or photograph a bill.
 * Resizes to max 768×768, converts to JPEG, and calls onImage(base64).
 */
export default function ImageCapture({ onImage, disabled }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [sending, setSending] = useState(false);

  const handleFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // Resize to max 768×768 maintaining aspect ratio
        const MAX = 768;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const scale = Math.min(MAX / width, MAX / height);
          width = Math.floor(width * scale);
          height = Math.floor(height * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];
        setPreview(canvas.toDataURL('image/jpeg', 0.6)); // lower quality for preview
        setSending(true);
        onImage(base64);
        setTimeout(() => setSending(false), 1500);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={styles.wrapper}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files[0])}
      />

      {preview ? (
        <div style={styles.previewContainer}>
          <img src={preview} alt="Bill" style={styles.preview} />
          {sending && <div style={styles.sendingOverlay}>Sending to River…</div>}
          <button
            style={styles.retakeBtn}
            onClick={() => {
              setPreview(null);
              inputRef.current.value = '';
            }}
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          style={{
            ...styles.cameraBtn,
            opacity: disabled ? 0.5 : 1,
          }}
          onClick={() => !disabled && inputRef.current?.click()}
          disabled={disabled}
          title="Upload bill or take photo"
        >
          <span style={styles.cameraIcon}>📷</span>
          <span style={styles.cameraLabel}>Pay a Bill</span>
        </button>
      )}
    </div>
  );
}

const styles = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraBtn: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    padding: '14px 20px',
    borderRadius: '14px',
    background: '#F0F4FA',
    border: '2px dashed #CBD5E1',
    transition: 'border-color 0.2s, background 0.2s',
  },
  cameraIcon: {
    fontSize: '24px',
  },
  cameraLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#5A6478',
  },
  previewContainer: {
    position: 'relative',
    borderRadius: '12px',
    overflow: 'hidden',
    width: '120px',
    height: '120px',
  },
  preview: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  sendingOverlay: {
    position: 'absolute',
    inset: 0,
    background: 'rgba(0,61,122,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: '600',
    color: '#fff',
    textAlign: 'center',
    padding: '8px',
  },
  retakeBtn: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
