import {useEffect, useState} from 'react';

import DeviceInfo from 'react-native-device-info';

import {formatBytes, hasEnoughSpace} from '../utils';

import {Model, ModelOrigin} from '../utils/types';

interface StorageCheckOptions {
  /**
   * Whether to periodically check storage.
   * If false, storage will only be checked once.
   * @default true
   */
  enablePeriodicCheck?: boolean;
  /**
   * Interval in milliseconds for storage checks when periodic checking is enabled
   * @default 10000 (10 seconds)
   */
  checkInterval?: number;
}

export const useStorageCheck = (
  model: Model,
  options: StorageCheckOptions = {},
) => {
  const {enablePeriodicCheck = true, checkInterval = 10000} = options;

  const [storageStatus, setStorageStatus] = useState({
    isOk: true,
    message: '',
  });
  //const [freeDiskStorage, setFreeDiskStorage] = useState<number | null>(null);

  // Effect to check storage and set up periodic checking if enabled
  useEffect(() => {
    const abortController = new AbortController();

    const checkStorage = async () => {
      try {
        if (
          model.isDownloaded ||
          model.isLocal ||
          model.origin === ModelOrigin.LOCAL
        ) {
          return;
        }

        const isEnoughSpace = await hasEnoughSpace(model);
        if (abortController.signal.aborted) {
          return;
        }

        if (!isEnoughSpace) {
          const freeDisk = await DeviceInfo.getFreeDiskStorage('important');
          if (abortController.signal.aborted) {
            return;
          }

          setStorageStatus({
            isOk: false,
            message: `Storage low! Model ${formatBytes(
              model.size,
            )} > ${formatBytes(freeDisk)} free`,
          });
        } else {
          setStorageStatus({
            isOk: true,
            message: '',
          });
        }
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error('Storage check failed:', error);
          setStorageStatus({isOk: false, message: 'Failed to check storage'});
        }
      }
    };

    checkStorage();
    let intervalId: NodeJS.Timeout | undefined;
    if (enablePeriodicCheck) {
      intervalId = setInterval(checkStorage, checkInterval);
    }

    return () => {
      abortController.abort();
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [model, enablePeriodicCheck, checkInterval]);

  return storageStatus;
};
