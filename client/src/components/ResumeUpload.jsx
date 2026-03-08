import { useState, useRef } from 'react';
import { uploadResume } from '../api';

const ACCEPTED_TYPES = '.txt,.pdf';
const MAX_SIZE_MB = 2;

export default function ResumeUpload({ onParsed, onCancel }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  function validateAndSet(selected) {
    setError('');
    if (!selected) return;

    const ext = selected.name.split('.').pop().toLowerCase();
    if (!['txt', 'pdf'].includes(ext)) {
      setError('Please upload a .txt or .pdf file.');
      setFile(null);
      return;
    }

    if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File is too large. Maximum size is ${MAX_SIZE_MB}MB.`);
      setFile(null);
      return;
    }

    if (selected.size === 0) {
      setError('The selected file is empty.');
      setFile(null);
      return;
    }

    setFile(selected);
  }

  function handleFileChange(e) {
    validateAndSet(e.target.files[0]);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDragEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }

  function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    validateAndSet(dropped);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const result = await uploadResume(file);
      onParsed(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="resume-upload">
      <h3>Upload Resume</h3>
      <p className="subtitle">
        Upload a <strong>.txt</strong> or <strong>.pdf</strong> resume to auto-fill your profile fields.
      </p>

      {error && <div className="error-banner">{error}</div>}

      <div
        className={`upload-area${dragging ? ' upload-area-active' : ''}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={handleDragOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="upload-icon">&#128196;</div>
        <p className="upload-hint">
          {file ? file.name : 'Click to select a file or drag it here'}
        </p>
        <p className="upload-size-hint">Max 2MB &middot; .txt or .pdf</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={handleFileChange}
          className="file-input-hidden"
        />
      </div>

      <div className="upload-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={handleUpload}
          disabled={!file || uploading}
        >
          {uploading ? 'Parsing...' : 'Parse Resume'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
