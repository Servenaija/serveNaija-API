const objectId = (value, helpers) => {
  if (!value.match(/^[0-9a-fA-F]{24}$/)) {
    return helpers.message('"{{#label}}" must be a valid mongo id');
  }
  return value;
};

/**
 * Standard strong password policy:
 * - At least 10 characters
 * - At least one uppercase letter (A-Z)
 * - At least one lowercase letter (a-z)
 * - At least one digit (0-9)
 * - At least one special character (!@#$%^&* etc.)
 * - No spaces
 * - Maximum 128 characters (bcrypt hard limit)
 */
const password = (value, helpers) => {
  if (typeof value !== 'string') {
    return helpers.message('Password must be a string.');
  }

  if (/\s/.test(value)) {
    return helpers.message('Password must not contain spaces.');
  }

  if (value.length < 10) {
    return helpers.message('Password must be at least 10 characters long.');
  }

  if (value.length > 128) {
    return helpers.message('Password must not exceed 128 characters.');
  }

  if (!/[A-Z]/.test(value)) {
    return helpers.message('Password must include at least one uppercase letter (A–Z).');
  }

  if (!/[a-z]/.test(value)) {
    return helpers.message('Password must include at least one lowercase letter (a–z).');
  }

  if (!/[0-9]/.test(value)) {
    return helpers.message('Password must include at least one number (0–9).');
  }

  // eslint-disable-next-line no-useless-escape
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(value)) {
    return helpers.message('Password must include at least one special character (e.g. !@#$%^&*).');
  }

  return value;
};

module.exports = {
  objectId,
  password,
};
  