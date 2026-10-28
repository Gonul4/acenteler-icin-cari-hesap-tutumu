const jwt = require('jsonwebtoken');
const User = require('../models/User');

async function requireAuth(req, res, next) {
  try {
    const token = req.cookies.access_token;

    if (!token) {
      return res.status(401).json({ message: 'Giriş yapmanız gerekiyor.' });
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'turizm-takip-api',
      audience: 'turizm-takip-web'
    });

    const user = await User.findById(payload.sub).select(
      'name username role active authVersion'
    );

    if (!user || !user.active || (payload.authVersion || 0) !== (user.authVersion || 0)) {
      return res.status(401).json({
        message: 'Kullanıcı bulunamadı veya pasif.'
      });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      message: 'Oturum geçersiz veya süresi dolmuş.'
    });
  }
}

module.exports = requireAuth;
