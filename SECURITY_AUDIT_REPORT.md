# Security Audit Report - fix/rag-query-response-handling Branch

**Date:** January 7, 2025  
**Auditor:** Security Review Team  
**Scope:** RAG Service improvements, Document Update API, AI Document Creation API  
**Framework:** OWASP Top 10 2023 compliance

## Executive Summary

The security audit of the fix/rag-query-response-handling branch reveals a generally secure implementation with strong defenses against common attack vectors. The code demonstrates good security practices including SSRF protection, input validation, path traversal prevention, and rate limiting. However, several areas require attention to achieve defense-in-depth security.

## Risk Rating Summary

| Component | Risk Level | OWASP Coverage |
|-----------|------------|----------------|
| RAG Service | **LOW** | A03, A06, A10 |
| Document Update API | **MEDIUM** | A01, A03, A04, A07 |
| AI Document Creation | **LOW** | A01, A03, A04 |
| Authentication | **MEDIUM** | A07, A08 |
| Rate Limiting | **MEDIUM** | A04 |
| CORS/CSP | **LOW** | A05, A06 |

## Detailed Security Findings

### 1. STRENGTHS - Well-Implemented Security Controls

#### 1.1 SSRF Protection (OWASP A10: Server-Side Request Forgery)
**Status:** ✅ EXCELLENT

The URL validator (`/lib/url-validator.ts`) provides comprehensive SSRF protection:
- Blocks private IP ranges (RFC 1918)
- Blocks IPv6 private/local addresses
- Domain allowlisting with strict validation
- Protocol restriction to HTTP/HTTPS only
- Credential injection prevention
- Null byte detection

```typescript
// Strong SSRF protection implementation
const BLOCKED_IP_RANGES = [
  /^10\./, // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[01])\./, // 172.16.0.0/12
  /^192\.168\./, // 192.168.0.0/16
  // ... comprehensive list
];
```

#### 1.2 Path Traversal Prevention (OWASP A01: Broken Access Control)
**Status:** ✅ STRONG

Excellent path traversal protection in document handling:
- Path resolution and validation
- Directory containment checks
- Filename sanitization
- Null byte protection

```typescript
// Proper path validation
if (!isPathWithinDirectory(resolvedPath, resolvedUploadDir)) {
  return NextResponse.json({ error: 'Invalid file path' }, { status: 403 });
}
```

#### 1.3 Input Validation (OWASP A03: Injection)
**Status:** ✅ GOOD

Comprehensive Zod schema validation across all endpoints:
- Type validation
- Length limits (10MB max content)
- Enum restrictions
- Format validation

#### 1.4 Content Sanitization (OWASP A03: Injection/XSS)
**Status:** ✅ GOOD

HTML/Markdown sanitization with sanitize-html:
- Tag allowlisting
- Attribute filtering
- XSS prevention
- Image source validation (partial)

### 2. VULNERABILITIES - Critical Issues Requiring Immediate Attention

#### 2.1 API Key Storage (OWASP A02: Cryptographic Failures)
**Severity:** 🔴 **HIGH**  
**Location:** `/app/api/auth.ts`

The API keys appear to be stored in plaintext in the database:
```typescript
.where(eq(apiKeysTable.api_key, apiKey)) // Direct comparison suggests plaintext
```

**Recommendation:**
- Hash API keys using bcrypt or argon2
- Store only the hash, not the plaintext
- Implement key rotation mechanism

**Secure Implementation:**
```typescript
import { hash, compare } from 'bcrypt';

// When storing
const hashedKey = await hash(apiKey, 12);

// When verifying
const isValid = await compare(providedKey, storedHash);
```

#### 2.2 Incomplete Image Source Validation in Document Update
**Severity:** 🟡 **MEDIUM**  
**Location:** `/app/api/documents/[id]/route.ts:463-483`

The image sanitization removes `src` attribute entirely, breaking functionality:
```typescript
img: ['alt', 'title', 'width', 'height'], // 'src' removed - breaks images
```

**Recommendation:**
```typescript
allowedAttributes: {
  img: ['src', 'alt', 'title', 'width', 'height'],
},
transformTags: {
  'img': function(tagName, attribs) {
    if (attribs.src) {
      try {
        const validatedUrl = validateExternalUrl(attribs.src, {
          allowedDomains: ['imgur.com', 'cloudinary.com', 'your-cdn.com']
        });
        attribs.src = validatedUrl.toString();
      } catch {
        return { tagName: 'span', text: '[Invalid image URL]' };
      }
    }
    return { tagName, attribs };
  }
}
```

#### 2.3 In-Memory Rate Limiting
**Severity:** 🟡 **MEDIUM**  
**Location:** `/lib/api-rate-limit.ts`

Current implementation uses in-memory storage, which:
- Doesn't work across multiple instances
- Loses state on restart
- Can be bypassed in distributed deployments

**Recommendation:**
```typescript
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export async function rateLimit(config: RateLimitConfig) {
  const key = `rate:${identifier}`;
  const current = await redis.incr(key);
  
  if (current === 1) {
    await redis.expire(key, config.windowMs / 1000);
  }
  
  if (current > config.max) {
    return rateLimitExceeded();
  }
}
```

### 3. SECURITY CONCERNS - Issues Requiring Attention

#### 3.1 Missing Request Size Validation in RAG Service
**Severity:** 🟡 **MEDIUM**  
**Location:** `/lib/rag-service.ts`

No request body size limits when sending to RAG API:
```typescript
body: JSON.stringify({
  query: query, // No size limit
  user_id: ragIdentifier,
})
```

**Recommendation:**
```typescript
// Add size validation
if (query.length > 10000) {
  throw new Error('Query too large');
}

// Add timeout
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 30000);

const response = await fetch(url, {
  signal: controller.signal,
  // ... rest of config
});
```

#### 3.2 Sensitive Error Information Exposure
**Severity:** 🟡 **MEDIUM**  
**Location:** Multiple endpoints

Development-specific error details could leak in production:
```typescript
...(process.env.NODE_ENV === 'development' && { filePath: document.file_path })
```

**Recommendation:**
- Use structured logging (winston/pino)
- Log detailed errors server-side only
- Return generic errors to clients
- Implement error tracking (Sentry)

#### 3.3 Missing CORS Configuration for API Routes
**Severity:** 🟡 **MEDIUM**  
**Location:** API route handlers

No explicit CORS headers in API responses.

**Recommendation:**
```typescript
// Add CORS middleware
export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowedOrigins = ['https://plugged.in', 'https://app.plugged.in'];
  
  if (origin && !allowedOrigins.includes(origin)) {
    return NextResponse.json(
      { error: 'CORS policy violation' },
      { status: 403 }
    );
  }
  
  const response = NextResponse.json(data);
  response.headers.set('Access-Control-Allow-Origin', origin || '*');
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  return response;
}
```

### 4. SECURITY ENHANCEMENTS - Recommended Improvements

#### 4.1 Enhanced Authentication
```typescript
// Add request signing for API calls
import { createHmac } from 'crypto';

function signRequest(payload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

// Verify signature
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = signRequest(payload, secret);
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
```

#### 4.2 Audit Logging Enhancement
```typescript
interface AuditLog {
  timestamp: Date;
  userId: string;
  action: string;
  resource: string;
  ip: string;
  userAgent: string;
  result: 'success' | 'failure';
  metadata?: Record<string, any>;
}

async function logSecurityEvent(event: AuditLog) {
  await db.insert(securityAuditTable).values(event);
  
  // Alert on suspicious patterns
  if (await detectAnomalousActivity(event)) {
    await alertSecurityTeam(event);
  }
}
```

#### 4.3 Content Security Policy Enhancement
```typescript
const enhancedCSP = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'nonce-${nonce}'", // Use nonces instead of unsafe-inline
    "style-src 'self' 'nonce-${nonce}'",
    "img-src 'self' data: https://cdn.plugged.in",
    "connect-src 'self' https://api.plugged.in",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ')
};
```

### 5. COMPLIANCE CHECKLIST

#### OWASP Top 10 2023 Coverage:

| Category | Status | Notes |
|----------|--------|-------|
| A01: Broken Access Control | ✅ | Good path traversal protection, authorization checks |
| A02: Cryptographic Failures | ❌ | API keys stored in plaintext |
| A03: Injection | ✅ | Strong input validation with Zod |
| A04: Insecure Design | ⚠️ | Rate limiting needs Redis backend |
| A05: Security Misconfiguration | ✅ | Good CSP headers, secure defaults |
| A06: Vulnerable Components | ❓ | Requires dependency audit |
| A07: Authentication Failures | ⚠️ | API key storage needs improvement |
| A08: Data Integrity Failures | ✅ | Good validation, sanitization |
| A09: Logging Failures | ⚠️ | Could improve security event logging |
| A10: SSRF | ✅ | Excellent SSRF protection |

### 6. IMMEDIATE ACTION ITEMS

1. **CRITICAL - Within 24 hours:**
   - Implement API key hashing
   - Fix image src attribute removal in document update

2. **HIGH - Within 1 week:**
   - Implement Redis-based rate limiting
   - Add request size limits to RAG service
   - Implement request timeouts

3. **MEDIUM - Within 2 weeks:**
   - Add CORS headers to API routes
   - Enhance audit logging
   - Implement request signing
   - Add security monitoring/alerting

### 7. SECURITY TESTING RECOMMENDATIONS

```bash
# Dependency vulnerability scan
npm audit
pnpm audit --audit-level=moderate

# OWASP ZAP scan
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t https://your-app-url.com

# Rate limiting test
for i in {1..100}; do
  curl -X POST https://api.plugged.in/documents/ai \
    -H "Authorization: Bearer $API_KEY" \
    -d '{"test": true}'
done

# Path traversal test
curl https://api.plugged.in/documents/../../../etc/passwd
```

### 8. CONCLUSION

The fix/rag-query-response-handling branch demonstrates strong security foundations with excellent SSRF protection, path traversal prevention, and input validation. The main concerns are:

1. **API key storage** - Critical issue requiring immediate attention
2. **Rate limiting scalability** - Important for production deployment
3. **Image handling** - Functionality vs security balance needed

Overall risk level: **MEDIUM** - The codebase is secure for development but requires the critical fixes before production deployment.

### 9. APPENDIX - Secure Code Examples

#### Example: Secure File Upload
```typescript
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

async function secureFileUpload(file: File, userId: string) {
  // Generate unique filename
  const fileId = uuidv4();
  const ext = path.extname(file.name).toLowerCase();
  const safeFilename = `${fileId}${ext}`;
  
  // Validate file type
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Invalid file type');
  }
  
  // Check file size
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('File too large');
  }
  
  // Calculate hash for integrity
  const buffer = await file.arrayBuffer();
  const hash = createHash('sha256').update(Buffer.from(buffer)).digest('hex');
  
  // Store with metadata
  const metadata = {
    originalName: file.name,
    size: file.size,
    type: file.type,
    hash,
    uploadedAt: new Date(),
    uploadedBy: userId,
  };
  
  return { filename: safeFilename, metadata };
}
```

#### Example: Secure API Endpoint
```typescript
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request);
    if (!rateLimitResult.allowed) {
      return rateLimitError();
    }
    
    // Authentication
    const auth = await authenticateRequest(request);
    if (!auth.success) {
      return unauthorizedError();
    }
    
    // Input validation
    const body = await request.json();
    const validated = schema.parse(body);
    
    // Authorization
    if (!canUserPerformAction(auth.user, validated.action)) {
      return forbiddenError();
    }
    
    // Business logic with error handling
    const result = await performSecureOperation(validated);
    
    // Audit logging
    await logAuditEvent({
      user: auth.user,
      action: validated.action,
      result: 'success',
    });
    
    // Secure response
    return NextResponse.json(
      { success: true, data: sanitizeOutput(result) },
      { 
        status: 200,
        headers: getSecurityHeaders(),
      }
    );
    
  } catch (error) {
    // Log error securely
    await logSecurityError(error);
    
    // Return generic error
    return NextResponse.json(
      { error: 'Operation failed' },
      { status: 500 }
    );
  }
}
```

---

**Report Generated:** January 7, 2025  
**Next Review Date:** February 7, 2025  
**Classification:** CONFIDENTIAL