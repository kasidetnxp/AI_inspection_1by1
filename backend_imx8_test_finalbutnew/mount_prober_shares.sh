#!/bin/bash
# ==============================================================================
# i.MX8 Production Line - Prober Network Drive Mount Helper
# ==============================================================================
# Usage:
#   sudo bash mount_prober_shares.sh [PROBER_IP] [USERNAME] [PASSWORD]
#
# Examples:
#   sudo bash mount_prober_shares.sh 192.168.1.100 operator prober123
# ==============================================================================

PROBER_IP="${1:-192.168.1.100}"
SMB_USER="${2:-guest}"
SMB_PASS="${3:-}"

MOUNT_OPTS="rw,file_mode=0777,dir_mode=0777,iocharset=utf8"
if [ -n "$SMB_USER" ]; then
    MOUNT_OPTS="$MOUNT_OPTS,username=$SMB_USER"
fi
if [ -n "$SMB_PASS" ]; then
    MOUNT_OPTS="$MOUNT_OPTS,password=$SMB_PASS"
else
    MOUNT_OPTS="$MOUNT_OPTS,guest"
fi

echo "======================================================="
echo "  Mounting Factory Drives (N: and M:) on i.MX8 Linux   "
echo "======================================================="
echo "  Prober Host : $PROBER_IP"
echo "  Credentials : User='$SMB_USER'"
echo "======================================================="

# 1. Create mount target folders
mkdir -p /mnt/N /mnt/M /mnt/n /mnt/m

# 2. Check cifs-utils
if ! command -v mount.cifs &> /dev/null; then
    echo "[WARN] cifs-utils not found. Attempting install (apt-get or opkg)..."
    if command -v apt-get &> /dev/null; then
        apt-get update && apt-get install -y cifs-utils
    elif command -v opkg &> /dev/null; then
        opkg update && opkg install cifs-utils
    fi
fi

# 3. Mount Drive N (Prober Input: IMAGE & Output: JUDGE)
echo "[INFO] Mounting Drive N: //${PROBER_IP}/N -> /mnt/N ..."
if mountpoint -q /mnt/N; then
    echo "  -> /mnt/N already mounted."
else
    mount -t cifs "//${PROBER_IP}/N" /mnt/N -o "$MOUNT_OPTS" || \
    mount -t cifs "//${PROBER_IP}/WP288" /mnt/N -o "$MOUNT_OPTS" || \
    echo "[ERROR] Failed to mount Drive N. Check network connection or share name."
fi

# 4. Mount Drive M (Visual Archives: PROCESSED & OUTPUT)
echo "[INFO] Mounting Drive M: //${PROBER_IP}/M -> /mnt/M ..."
if mountpoint -q /mnt/M; then
    echo "  -> /mnt/M already mounted."
else
    mount -t cifs "//${PROBER_IP}/M" /mnt/M -o "$MOUNT_OPTS" || \
    mount -t cifs "//${PROBER_IP}/ShareM" /mnt/M -o "$MOUNT_OPTS" || \
    echo "[ERROR] Failed to mount Drive M. Check network connection or share name."
fi

echo "======================================================="
echo "  Current Mount Status on i.MX8:                       "
echo "======================================================="
df -h | grep -E "/mnt/N|/mnt/M" || echo "[INFO] No CIFS mounts detected in df output."
echo ""
echo "Done! The i.MX8 backend will automatically detect these mounts."
