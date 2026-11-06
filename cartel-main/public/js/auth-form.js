import { api, initPage, safeNext } from './common.js'

const { user } = await initPage()
const next = safeNext(new URLSearchParams(location.search).get('next'))

if (user) location.replace(next)

const form = document.getElementById('auth-form')
const errorEl = document.getElementById('form-error')
const mode = form.dataset.mode

document.querySelectorAll('[data-carry-next]').forEach((link) => {
  if (next !== '/') link.href = `${link.getAttribute('href')}?next=${encodeURIComponent(next)}`
})

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!form.reportValidity()) return

  const button = form.querySelector('button[type="submit"]')
  button.disabled = true
  errorEl.textContent = ''
  try {
    await api(`/auth/${mode}`, { method: 'POST', body: Object.fromEntries(new FormData(form)) })
    location.href = next
  } catch (error) {
    errorEl.textContent = error.message
    button.disabled = false
  }
})
