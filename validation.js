/**
 * Validation System
 * 
 * ⚠️ CRITICAL: This file contains all common validation rules.
 * All pages use this for consistent form validation.
 * 
 * ✅ Email validation
 * ✅ Password validation (with strength check)
 * ✅ Amount validation
 * ✅ Referral code validation
 * ✅ Name validation
 * ✅ Phone validation
 * ✅ Address validation
 * ✅ URL validation (using native URL API)
 * ✅ Date validation
 * ✅ Form validation helper
 * ✅ Multiple error display support
 * 
 * Integration with:
 * - All pages (login, signup, deposit, withdrawal, profile, support)
 * - auth.js for authentication
 * - buy-package.js for amount validation
 * 
 * ⚠️ IMPORTANT: This file has NO database writes.
 * Safe for all users - existing data is NOT affected.
 */

// ============================================================
// CONSTANTS
// ============================================================

export const VALIDATION_RULES = {
    // Email
    EMAIL_MIN_LENGTH: 5,
    EMAIL_MAX_LENGTH: 100,
    EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    
    // ✅ FIX 1: Referral Code with min/max
    REFERRAL_CODE_MIN: 6,
    REFERRAL_CODE_MAX: 12,
    REFERRAL_CODE_PATTERN: /^[A-Z0-9]+$/,
    
    // ✅ FIX 2: Password - Less strict
    PASSWORD_MIN_LENGTH: 6,
    PASSWORD_MAX_LENGTH: 30,
    PASSWORD_UPPERCASE: /[A-Z]/,
    PASSWORD_LOWERCASE: /[a-z]/,
    PASSWORD_NUMBER: /[0-9]/,
    PASSWORD_SPECIAL: /[!@#$%^&*(),.?":{}|<>]/,
    
    // Name
    NAME_MIN_LENGTH: 2,
    NAME_MAX_LENGTH: 50,
    NAME_PATTERN: /^[a-zA-Z\s\-']+$/,
    
    // Amount
    AMOUNT_MIN: 0.01,
    AMOUNT_MAX: 99999999.99,
    AMOUNT_DECIMALS: 8,
    
    // Phone
    PHONE_PATTERN: /^[0-9+\-\s()]{10,15}$/,
    
    // Date
    DATE_PATTERN: /^\d{4}-\d{2}-\d{2}$/,
    
    // Address
    ADDRESS_MIN_LENGTH: 5,
    ADDRESS_MAX_LENGTH: 255
};

// ============================================================
// HELPER - Get Error Messages
// ============================================================

function getErrorMessages(results) {
    const messages = [];
    for (let field in results) {
        if (!results[field].valid) {
            messages.push(...results[field].errors);
        }
    }
    return messages;
}

// ============================================================
// EMAIL VALIDATION
// ============================================================

export function validateEmail(email) {
    const errors = [];
    
    if (!email) {
        errors.push('Email is required');
        return { valid: false, errors };
    }
    
    if (typeof email !== 'string') {
        errors.push('Email must be a string');
        return { valid: false, errors };
    }
    
    const trimmedEmail = email.trim();
    
    if (trimmedEmail.length < VALIDATION_RULES.EMAIL_MIN_LENGTH) {
        errors.push(`Email must be at least ${VALIDATION_RULES.EMAIL_MIN_LENGTH} characters`);
    }
    
    if (trimmedEmail.length > VALIDATION_RULES.EMAIL_MAX_LENGTH) {
        errors.push(`Email must be less than ${VALIDATION_RULES.EMAIL_MAX_LENGTH} characters`);
    }
    
    if (!VALIDATION_RULES.EMAIL_PATTERN.test(trimmedEmail)) {
        errors.push('Please enter a valid email address');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// ============================================================
// PASSWORD VALIDATION
// ============================================================

// ✅ FIX 2: Basic password validation (less strict)
export function validatePassword(password) {
    const errors = [];
    
    if (!password) {
        errors.push('Password is required');
        return { valid: false, errors };
    }
    
    if (typeof password !== 'string') {
        errors.push('Password must be a string');
        return { valid: false, errors };
    }
    
    if (password.length < VALIDATION_RULES.PASSWORD_MIN_LENGTH) {
        errors.push(`Password must be at least ${VALIDATION_RULES.PASSWORD_MIN_LENGTH} characters`);
    }
    
    if (password.length > VALIDATION_RULES.PASSWORD_MAX_LENGTH) {
        errors.push(`Password must be less than ${VALIDATION_RULES.PASSWORD_MAX_LENGTH} characters`);
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// ✅ FIX 2: Password strength with optional checks
export function validatePasswordStrength(password) {
    const errors = [];
    let strength = 0;
    
    if (!password) {
        errors.push('Password is required');
        return { valid: false, errors, strength: 0 };
    }
    
    if (typeof password !== 'string') {
        errors.push('Password must be a string');
        return { valid: false, errors, strength: 0 };
    }
    
    // Length check
    if (password.length < VALIDATION_RULES.PASSWORD_MIN_LENGTH) {
        errors.push(`Password must be at least ${VALIDATION_RULES.PASSWORD_MIN_LENGTH} characters`);
    } else {
        strength += 25;
    }
    
    if (password.length > VALIDATION_RULES.PASSWORD_MAX_LENGTH) {
        errors.push(`Password must be less than ${VALIDATION_RULES.PASSWORD_MAX_LENGTH} characters`);
    }
    
    // ✅ FIX 2: Optional checks (don't fail if missing)
    if (VALIDATION_RULES.PASSWORD_UPPERCASE.test(password)) {
        strength += 25;
    }
    
    if (VALIDATION_RULES.PASSWORD_LOWERCASE.test(password)) {
        strength += 25;
    }
    
    if (VALIDATION_RULES.PASSWORD_NUMBER.test(password)) {
        strength += 25;
    }
    
    if (VALIDATION_RULES.PASSWORD_SPECIAL.test(password)) {
        strength += 25;
    }
    
    // ✅ FIX 2: Only fail on minimum length
    const valid = password.length >= VALIDATION_RULES.PASSWORD_MIN_LENGTH;
    
    return {
        valid: valid,
        errors: valid ? [] : errors,
        strength: Math.min(strength, 100)
    };
}

export function getPasswordStrengthLabel(strength) {
    if (strength < 25) {
        return { label: 'Very Weak', color: '#ef4444' };
    } else if (strength < 50) {
        return { label: 'Weak', color: '#f59e0b' };
    } else if (strength < 75) {
        return { label: 'Fair', color: '#fbbf24' };
    } else if (strength < 90) {
        return { label: 'Good', color: '#22c55e' };
    } else {
        return { label: 'Strong', color: '#22c55e' };
    }
}

// ============================================================
// NAME VALIDATION
// ============================================================

export function validateName(name, required = true) {
    const errors = [];
    
    if (!name && required) {
        errors.push('Name is required');
        return { valid: false, errors };
    }
    
    if (name === undefined || name === null) {
        return { valid: !required, errors: required ? ['Name is required'] : [] };
    }
    
    if (typeof name !== 'string') {
        errors.push('Name must be a string');
        return { valid: false, errors };
    }
    
    const trimmedName = name.trim();
    
    if (trimmedName.length === 0 && required) {
        errors.push('Name is required');
    }
    
    if (trimmedName.length > 0 && trimmedName.length < VALIDATION_RULES.NAME_MIN_LENGTH) {
        errors.push(`Name must be at least ${VALIDATION_RULES.NAME_MIN_LENGTH} characters`);
    }
    
    if (trimmedName.length > VALIDATION_RULES.NAME_MAX_LENGTH) {
        errors.push(`Name must be less than ${VALIDATION_RULES.NAME_MAX_LENGTH} characters`);
    }
    
    if (trimmedName.length > 0 && !VALIDATION_RULES.NAME_PATTERN.test(trimmedName)) {
        errors.push('Name can only contain letters, spaces, hyphens, and apostrophes');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// ============================================================
// AMOUNT VALIDATION
// ============================================================

// ✅ FIX 3: Using Number() instead of parseFloat()
export function validateAmount(amount, min = VALIDATION_RULES.AMOUNT_MIN, max = VALIDATION_RULES.AMOUNT_MAX, decimals = VALIDATION_RULES.AMOUNT_DECIMALS) {
    const errors = [];
    
    if (amount === undefined || amount === null || amount === '') {
        errors.push('Amount is required');
        return { valid: false, errors };
    }
    
    // ✅ FIX 3: Number() is safer than parseFloat()
    const numAmount = Number(amount);
    
    if (isNaN(numAmount)) {
        errors.push('Please enter a valid number');
        return { valid: false, errors };
    }
    
    if (numAmount < min) {
        errors.push(`Minimum amount is ${min}`);
    }
    
    if (numAmount > max) {
        errors.push(`Maximum amount is ${max}`);
    }
    
    // Check decimal places
    const decimalStr = String(numAmount);
    const decimalParts = decimalStr.split('.');
    if (decimalParts.length === 2 && decimalParts[1].length > decimals) {
        errors.push(`Amount can have at most ${decimals} decimal places`);
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// ============================================================
// REFERRAL CODE VALIDATION
// ============================================================

// ✅ FIX 1: Min/Max length support
export function validateReferralCode(code, required = false) {
    const errors = [];
    
    if (!code) {
        if (required) {
            errors.push('Referral code is required');
        }
        return { valid: !required, errors };
    }
    
    if (typeof code !== 'string') {
        errors.push('Referral code must be a string');
        return { valid: false, errors };
    }
    
    const trimmedCode = code.trim().toUpperCase();
    
    if (trimmedCode.length < VALIDATION_RULES.REFERRAL_CODE_MIN) {
        errors.push(`Referral code must be at least ${VALIDATION_RULES.REFERRAL_CODE_MIN} characters`);
    }
    
    if (trimmedCode.length > VALIDATION_RULES.REFERRAL_CODE_MAX) {
        errors.push(`Referral code must be less than ${VALIDATION_RULES.REFERRAL_CODE_MAX} characters`);
    }
    
    if (!VALIDATION_RULES.REFERRAL_CODE_PATTERN.test(trimmedCode)) {
        errors.push('Referral code can only contain letters and numbers');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// ============================================================
// PHONE VALIDATION
// ============================================================

export function validatePhone(phone, required = false) {
    const errors = [];
    
    if (!phone) {
        if (required) {
            errors.push('Phone number is required');
        }
        return { valid: !required, errors };
    }
    
    if (typeof phone !== 'string') {
        errors.push('Phone number must be a string');
        return { valid: false, errors };
    }
    
    const trimmedPhone = phone.trim();
    
    if (trimmedPhone.length === 0 && required) {
        errors.push('Phone number is required');
        return { valid: false, errors };
    }
    
    if (trimmedPhone.length > 0 && !VALIDATION_RULES.PHONE_PATTERN.test(trimmedPhone)) {
        errors.push('Please enter a valid phone number');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// ============================================================
// URL VALIDATION (Using Native URL API)
// ============================================================

// ✅ FIX 4: Using native URL API
export function validateURL(url, required = false) {
    const errors = [];
    
    if (!url) {
        if (required) {
            errors.push('URL is required');
        }
        return { valid: !required, errors };
    }
    
    if (typeof url !== 'string') {
        errors.push('URL must be a string');
        return { valid: false, errors };
    }
    
    const trimmedUrl = url.trim();
    
    if (trimmedUrl.length === 0 && required) {
        errors.push('URL is required');
        return { valid: false, errors };
    }
    
    if (trimmedUrl.length > 0) {
        try {
            // ✅ FIX 4: Native URL constructor is more reliable
            const urlObj = new URL(trimmedUrl);
            // Check if protocol is http or https
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                errors.push('URL must start with http:// or https://');
            }
        } catch (e) {
            errors.push('Please enter a valid URL');
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// ============================================================
// DATE VALIDATION
// ============================================================

export function validateDate(date, required = false) {
    const errors = [];
    
    if (!date) {
        if (required) {
            errors.push('Date is required');
        }
        return { valid: !required, errors };
    }
    
    if (typeof date !== 'string') {
        errors.push('Date must be a string');
        return { valid: false, errors };
    }
    
    const trimmedDate = date.trim();
    
    if (trimmedDate.length === 0 && required) {
        errors.push('Date is required');
        return { valid: false, errors };
    }
    
    if (trimmedDate.length > 0) {
        if (!VALIDATION_RULES.DATE_PATTERN.test(trimmedDate)) {
            errors.push('Please enter a valid date (YYYY-MM-DD)');
        } else {
            const parts = trimmedDate.split('-');
            const year = parseInt(parts[0]);
            const month = parseInt(parts[1]);
            const day = parseInt(parts[2]);
            
            const dateObj = new Date(year, month - 1, day);
            if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) {
                errors.push('Please enter a valid date');
            }
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// ============================================================
// ADDRESS VALIDATION
// ============================================================

export function validateAddress(address, required = false) {
    const errors = [];
    
    if (!address) {
        if (required) {
            errors.push('Address is required');
        }
        return { valid: !required, errors };
    }
    
    if (typeof address !== 'string') {
        errors.push('Address must be a string');
        return { valid: false, errors };
    }
    
    const trimmedAddress = address.trim();
    
    if (trimmedAddress.length === 0 && required) {
        errors.push('Address is required');
        return { valid: false, errors };
    }
    
    if (trimmedAddress.length > 0) {
        if (trimmedAddress.length < VALIDATION_RULES.ADDRESS_MIN_LENGTH) {
            errors.push(`Address must be at least ${VALIDATION_RULES.ADDRESS_MIN_LENGTH} characters`);
        }
        if (trimmedAddress.length > VALIDATION_RULES.ADDRESS_MAX_LENGTH) {
            errors.push(`Address must be less than ${VALIDATION_RULES.ADDRESS_MAX_LENGTH} characters`);
        }
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

// ============================================================
// FORM VALIDATION HELPER (Multiple Errors)
// ============================================================

export function validateField(value, validator, options = {}) {
    if (typeof validator !== 'function') {
        return { valid: false, errors: ['Invalid validator'] };
    }
    return validator(value, options);
}

// ✅ FIX 6: Multiple errors support
export function validateForm(fields, validators) {
    const errors = {};
    let isValid = true;
    
    for (let fieldName in validators) {
        const value = fields[fieldName];
        const validator = validators[fieldName];
        const result = validateField(value, validator);
        
        if (!result.valid) {
            isValid = false;
            errors[fieldName] = result.errors;
        }
    }
    
    return {
        valid: isValid,
        errors: errors,
        // ✅ FIX 6: Get all error messages
        getAllErrors: function() {
            return getErrorMessages(errors);
        },
        // Get first error message
        getFirstError: function() {
            const allErrors = this.getAllErrors();
            return allErrors.length > 0 ? allErrors[0] : null;
        }
    };
}

// ============================================================
// ✅ FIX 7: Only Named Exports (No Default Export)
// ============================================================

// ============================================================
// EXPOSE GLOBALLY
// ============================================================

if (typeof window !== 'undefined') {
    window.validateEmail = validateEmail;
    window.validatePassword = validatePassword;
    window.validatePasswordStrength = validatePasswordStrength;
    window.getPasswordStrengthLabel = getPasswordStrengthLabel;
    window.validateName = validateName;
    window.validateAmount = validateAmount;
    window.validateReferralCode = validateReferralCode;
    window.validatePhone = validatePhone;
    window.validateURL = validateURL;
    window.validateDate = validateDate;
    window.validateAddress = validateAddress;
    window.validateField = validateField;
    window.validateForm = validateForm;
    window.VALIDATION_RULES = VALIDATION_RULES;
}