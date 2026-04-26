import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import { createDeployment } from '../lib/api'

interface Props {
  onSuccess: () => void
}

export function DeployForm({ onSuccess }: Props) {
  const [mode, setMode] = useState<'git' | 'upload'>('git')
  const [gitUrl, setGitUrl] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const mutation = useMutation({
    mutationFn: (fd: FormData) => createDeployment(fd),
    onSuccess: () => {
      onSuccess()
      setGitUrl('')
      setFile(null)
      setFormError(null)
    },
    onError: (err) => {
      setFormError(err instanceof Error ? err.message : 'Deployment failed')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    const fd = new FormData()
    fd.append('source_type', mode)

    if (mode === 'git') {
      if (!gitUrl.trim()) {
        setFormError('Git URL is required')
        return
      }
      fd.append('git_url', gitUrl.trim())
    } else {
      if (!file) {
        setFormError('Please select a ZIP file')
        return
      }
      fd.append('file', file)
    }

    mutation.mutate(fd)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    setFile(f)
    setFormError(null)
  }

  const isLoading = mutation.isPending

  return (
    <div className="deploy-form-wrap">
      <h2>New Deployment</h2>
      <form className="card deploy-form" onSubmit={handleSubmit}>
        {/* Source type toggle */}
        <div className="source-toggle">
          <button
            type="button"
            className={mode === 'git' ? 'active' : ''}
            onClick={() => { setMode('git'); setFormError(null) }}
          >
            Git URL
          </button>
          <button
            type="button"
            className={mode === 'upload' ? 'active' : ''}
            onClick={() => { setMode('upload'); setFormError(null) }}
          >
            Upload ZIP
          </button>
        </div>

        <div className="form-row">
          {mode === 'git' ? (
            <input
              type="text"
              className="form-input"
              placeholder="https://github.com/user/repo.git"
              value={gitUrl}
              onChange={(e) => setGitUrl(e.target.value)}
              disabled={isLoading}
              spellCheck={false}
              autoComplete="off"
            />
          ) : (
            <label className={`file-drop ${file ? 'has-file' : ''}`}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                onChange={handleFileChange}
                disabled={isLoading}
              />
              <span style={{ fontSize: 16 }}>{file ? '📦' : '📂'}</span>
              <span>
                {file ? file.name : 'Click to select a .zip file'}
              </span>
            </label>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner" />
                Deploying…
              </>
            ) : (
              <>
                <span>▲</span> Deploy
              </>
            )}
          </button>
        </div>

        {formError && (
          <div className="form-error">
            <span>✕</span> {formError}
          </div>
        )}
      </form>
    </div>
  )
}
