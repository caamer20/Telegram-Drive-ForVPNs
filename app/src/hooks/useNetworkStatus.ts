import { useState, useEffect, useRef } from 'react';

/**
 * Network detection optimized for high-latency VPN connections
 * 
 * Uses cmd_is_network_available which now checks multiple Telegram DCs.
 * Adaptive polling: 30s when online, 45s when offline to reduce VPN traffic.
 */
export function useNetworkStatus() {
    const [isOnline, setIsOnline] = useState(true);
    const isOnlineRef = useRef(true);

    useEffect(() => {
        import('@tauri-apps/api/core').then(({ invoke }) => {
            const checkNetwork = async () => {
                try {
                    const available = await invoke<boolean>('cmd_is_network_available');
                    setIsOnline(available);
                    isOnlineRef.current = available;
                } catch (error) {
                    setIsOnline(false);
                    isOnlineRef.current = false;
                }
            };

            // Initial check
            checkNetwork();

            // Adaptive polling: faster when online, slower when offline
            const getInterval = () => isOnlineRef.current ? 30000 : 45000;

            let timeoutId: ReturnType<typeof setTimeout>;
            const scheduleNext = () => {
                timeoutId = setTimeout(() => {
                    checkNetwork().then(scheduleNext);
                }, getInterval());
            };
            scheduleNext();

            return () => clearTimeout(timeoutId);
        });
    }, []);

    return isOnline;
}
