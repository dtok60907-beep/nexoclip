export function validateAuthFields({ email, password }) {
  const errors = {};
  const normalizedEmail = String(email || '').trim();
  if (!normalizedEmail) errors.email = 'Email is required.';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Password is required.';
  else if (password.length < 12) errors.password = 'Password must be at least 12 characters.';
  return errors;
}

export function getAuthRequest(mode, values) {
  return {
    path: mode === 'register' ? '/api/auth/register' : '/api/auth/login',
    options: {
      method: 'POST',
      body: JSON.stringify({
        email: values.email.trim(),
        password: values.password,
        ...(mode === 'register' && values.displayName?.trim() ? { displayName: values.displayName.trim() } : {}),
      }),
    },
  };
}
