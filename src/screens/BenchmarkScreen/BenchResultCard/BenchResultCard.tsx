import {View} from 'react-native';
import React from 'react';

import {Card, Text, Button} from 'react-native-paper';

import {useTheme} from '../../../hooks';

import {createStyles} from './styles';

import {formatBytes, formatNumber} from '../../../utils';
import {BenchmarkResult} from '../../../utils/types';

type Props = {
  result: BenchmarkResult;
  onDelete: (timestamp: string) => void;
};

export const BenchResultCard = ({result, onDelete}: Props) => {
  const theme = useTheme();
  const styles = createStyles(theme);

  const formatDuration = (ms: number) => {
    if (ms < 1000) {
      return `${ms}ms`;
    }
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      const remainingSeconds = seconds % 60;
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  return (
    <Card elevation={0} style={styles.resultCard}>
      <Card.Content>
        <View style={styles.resultHeader}>
          <View style={styles.headerLeft}>
            <Text variant="titleSmall" style={styles.modelName}>
              {result.modelName}
            </Text>
            <Text style={styles.modelMeta}>
              {formatBytes(result.modelSize)} •{' '}
              {formatNumber(result.modelNParams, 2, true, false)} params
            </Text>
          </View>
          <Button
            testID="delete-result-button"
            mode="text"
            onPress={() => onDelete(result.timestamp)}
            icon="delete"
            compact
            style={styles.deleteButton}>
            {''}
          </Button>
        </View>

        <View style={styles.configContainer}>
          <View style={styles.configBar}>
            <Text variant="labelSmall">Benchmark Config</Text>
            <Text style={styles.configText}>
              PP: {result.config.pp} • TG: {result.config.tg} • PL:{' '}
              {result.config.pl} • Rep: {result.config.nr}
            </Text>
          </View>

          {result.initSettings && (
            <View style={styles.configBar}>
              <Text variant="labelSmall">Model Settings</Text>
              <View style={styles.configTextContainer}>
                <Text style={styles.configText}>
                  Context: {result.initSettings.n_context} • Batch:{' '}
                  {result.initSettings.n_batch} • UBatch:{' '}
                  {result.initSettings.n_ubatch}
                </Text>
                <Text style={styles.configText}>
                  CPU Threads: {result.initSettings.n_threads} • GPU Layers:{' '}
                  {result.initSettings.n_gpu_layers}
                </Text>
                {result.initSettings.flash_attn ? (
                  <Text style={styles.configText}>
                    Flash Attention Enabled • Cache Types:{' '}
                    {result.initSettings.cache_type_k}/
                    {result.initSettings.cache_type_v}
                  </Text>
                ) : (
                  <Text style={styles.configText}>
                    Flash Attention Disabled
                  </Text>
                )}
              </View>
            </View>
          )}
        </View>

        <View style={styles.resultsContainer}>
          <View style={styles.resultRow}>
            <View style={styles.resultItem}>
              <Text style={styles.resultValue}>
                {result.ppAvg.toFixed(2)}
                <Text style={styles.resultUnit}> t/s</Text>
              </Text>
              <Text style={styles.resultLabel}>Prompt Processing</Text>
              <Text style={styles.resultStd}>±{result.ppStd.toFixed(2)}</Text>
            </View>
            <View style={styles.resultItem}>
              <Text style={styles.resultValue}>
                {result.tgAvg.toFixed(2)}
                <Text style={styles.resultUnit}> t/s</Text>
              </Text>
              <Text style={styles.resultLabel}>Token Generation</Text>
              <Text style={styles.resultStd}>±{result.tgStd.toFixed(2)}</Text>
            </View>
          </View>

          {(result.wallTimeMs || result.peakMemoryUsage) && (
            <View style={styles.resultRow}>
              {result.wallTimeMs && (
                <View style={styles.resultItem}>
                  <Text style={styles.resultValue}>
                    {formatDuration(result.wallTimeMs)}
                  </Text>
                  <Text style={styles.resultLabel}>Total Time</Text>
                </View>
              )}
              {result.peakMemoryUsage && (
                <View style={styles.resultItem}>
                  <Text style={styles.resultValue}>
                    {result.peakMemoryUsage.percentage.toFixed(1)}%
                  </Text>
                  <Text style={styles.resultLabel}>Peak Memory</Text>
                  <Text style={styles.resultStd}>
                    {formatBytes(result.peakMemoryUsage.used, 0)} /{' '}
                    {formatBytes(result.peakMemoryUsage.total, 0)}
                  </Text>
                </View>
              )}
            </View>
          )}
          <Text style={styles.timestamp}>
            {new Date(result.timestamp).toLocaleString()}
          </Text>
        </View>
      </Card.Content>
    </Card>
  );
};
