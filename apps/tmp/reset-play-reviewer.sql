UPDATE "User"
SET "passwordHash" = '$2a$10$Tm9sUkI/ISON.oBmP07Q2uKOyDPOsyeSyR.rpZTbRj5K7O684vKMm',
    "lockedUntil" = NULL,
    "failedLoginCount" = 0
WHERE email = 'play.review@nexara.com.mx';
