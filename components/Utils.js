// Checks
// Is valid email
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Is valid password
function isPasswordComplex(password) {
  // Checks if the password is at least 8 characters long
  const minLength = /.{8,}/;
  // Checks if it contains at least one uppercase letter
  const hasUpperCase = /[A-Z]/;
  // Checks if it contains at least one lowercase letter
  const hasLowerCase = /[a-z]/;
  // Checks if it contains at least one digit
  const hasNumber = /[0-9]/;
  // Checks if it contains at least one special character
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/;

  // Returns true only if all conditions are met
  return (
    minLength.test(password) &&
    hasUpperCase.test(password) &&
    hasLowerCase.test(password) &&
    hasNumber.test(password) &&
    hasSpecialChar.test(password)
  );
}


// Is valid username
function isValidUsername(username) {
  // Regular expression to ensure the username is 3-32 characters long and contains only letters
  const usernameRegex = /^[A-Za-z]{3,32}$/;

  const isValid = usernameRegex.test(username);

  // Check if username can be changed (2 changes per 2 weeks)
  const canChangeUsername = false; //todo implement request

  return isValid && !canChangeUsername;
}

// Save token
//todo