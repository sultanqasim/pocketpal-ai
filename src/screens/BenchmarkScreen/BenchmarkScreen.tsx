import {View, ScrollView} from 'react-native';
import React, {useState, useCallback} from 'react';

import {v4 as uuidv4} from 'uuid';
import {observer} from 'mobx-react';
import RNDeviceInfo from 'react-native-device-info';
import Slider from '@react-native-community/slider';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Text, Button, Card, ActivityIndicator, Icon} from 'react-native-paper';

import {Menu, Dialog} from '../../components';

import {useTheme} from '../../hooks';

import {createStyles} from './styles';
import {DeviceInfoCard} from './DeviceInfoCard';
import {BenchResultCard} from './BenchResultCard';

import {modelStore, benchmarkStore} from '../../store';

import type {DeviceInfo, Model} from '../../utils/types';
import {BenchmarkConfig, BenchmarkResult} from '../../utils/types';

const DEFAULT_CONFIGS: BenchmarkConfig[] = [
  {pp: 512, tg: 128, pl: 1, nr: 3, label: 'Default'},
  {pp: 128, tg: 32, pl: 1, nr: 3, label: 'Fast'},
];

const getBinarySteps = (min: number, max: number): number[] => {
  const steps: number[] = [];
  let current = min;
  while (current <= max) {
    steps.push(current);
    current *= 2;
  }
  return steps;
};

const BENCHMARK_PARAMS_METADATA = {
  pp: {
    validation: {min: 64, max: 4096},
    descriptionKey:
      'Number of prompt processing tokens (max: physical batch size)',
    steps: getBinarySteps(64, 4096),
  },
  tg: {
    validation: {min: 32, max: 2048},
    descriptionKey: 'Number of text generation tokens',
    steps: getBinarySteps(32, 2048),
  },
  pl: {
    validation: {min: 1, max: 4},
    descriptionKey: 'Pipeline parallel size',
    steps: [1, 2, 3, 4],
  },
  nr: {
    validation: {min: 1, max: 10},
    descriptionKey: 'Number of repetitions',
    steps: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  },
};

export const BenchmarkScreen: React.FC = observer(() => {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedConfig, setSelectedConfig] = useState<BenchmarkConfig>(
    DEFAULT_CONFIGS[0],
  );
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);
  const [showAdvancedDialog, setShowAdvancedDialog] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [pendingDeleteTimestamp, setPendingDeleteTimestamp] = useState<
    string | null
  >(null);
  const [deleteAllConfirmVisible, setDeleteAllConfirmVisible] = useState(false);
  const [, setDeviceInfo] = useState<DeviceInfo | null>(null);

  const theme = useTheme();
  const styles = createStyles(theme);

  const handleSliderChange = (name: string, value: number) => {
    setSelectedConfig(prev => ({
      ...prev,
      [name]: value,
      label: 'Custom',
    }));
  };

  const handleModelSelect = async (model: Model) => {
    setShowModelMenu(false);
    if (model.id !== modelStore.activeModelId) {
      try {
        await modelStore.initContext(model);
        setSelectedModel(model);
      } catch (error) {
        if (error instanceof Error) {
          console.error('Model initialization error:', error);
        }
      }
    } else {
      setSelectedModel(model);
    }
  };

  const trackPeakMemoryUsage = async () => {
    try {
      const total = await RNDeviceInfo.getTotalMemory();
      const used = await RNDeviceInfo.getUsedMemory();
      const percentage = (used / total) * 100;
      return {total, used, percentage};
    } catch (error) {
      console.error('Failed to fetch memory stats:', error);
      return null;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const stopBenchmark = async () => {
    if (modelStore.context) {
      try {
        // TODO: This is not working for bench.
        await modelStore.context.stopCompletion();
      } catch (error) {
        console.error('Error stopping benchmark:', error);
      }
    }
  };

  const runBenchmark = async () => {
    if (!modelStore.context || !modelStore.activeModel) {
      return;
    }

    setIsRunning(true);
    let peakMemoryUsage: NonNullable<
      BenchmarkResult['peakMemoryUsage']
    > | null = null;
    let memoryCheckInterval: ReturnType<typeof setInterval> | undefined;
    const startTime = Date.now();

    try {
      // Start memory tracking
      memoryCheckInterval = setInterval(async () => {
        const currentUsage = await trackPeakMemoryUsage();
        if (
          currentUsage &&
          (!peakMemoryUsage ||
            currentUsage.percentage > peakMemoryUsage.percentage)
        ) {
          peakMemoryUsage = currentUsage;
        }
      }, 1000);

      const {modelDesc, modelSize, modelNParams, ppAvg, ppStd, tgAvg, tgStd} =
        await modelStore.context.bench(
          selectedConfig.pp,
          selectedConfig.tg,
          selectedConfig.pl,
          selectedConfig.nr,
        );

      const wallTimeMs = Date.now() - startTime;

      const result: BenchmarkResult = {
        config: selectedConfig,
        modelDesc,
        modelSize,
        modelNParams,
        ppAvg,
        ppStd,
        tgAvg,
        tgStd,
        timestamp: new Date().toISOString(),
        modelId: modelStore.activeModel.id,
        modelName: modelStore.activeModel.name,
        oid: modelStore.activeModel.hfModelFile?.oid,
        rfilename: modelStore.activeModel.hfModelFile?.rfilename,
        filename: modelStore.activeModel.filename,
        peakMemoryUsage: peakMemoryUsage || undefined,
        wallTimeMs,
        uuid: uuidv4(),
        initSettings: modelStore.activeContextSettings,
      };

      benchmarkStore.addResult(result);
    } catch (error) {
      if (error instanceof Error) {
        console.error('Benchmark error:', error);
      }
    } finally {
      clearInterval(memoryCheckInterval);
      setIsRunning(false);
    }
  };

  const handlePresetSelect = (config: BenchmarkConfig) => {
    setSelectedConfig(config);
  };

  const handleDeleteResult = (timestamp: string) => {
    setPendingDeleteTimestamp(timestamp);
    setDeleteConfirmVisible(true);
  };

  const handleConfirmDelete = () => {
    if (pendingDeleteTimestamp) {
      benchmarkStore.removeResult(pendingDeleteTimestamp);
    }
    setDeleteConfirmVisible(false);
    setPendingDeleteTimestamp(null);
  };

  const handleDeleteAll = () => {
    setDeleteAllConfirmVisible(true);
  };

  const handleConfirmDeleteAll = () => {
    benchmarkStore.clearResults();
    setDeleteAllConfirmVisible(false);
  };

  const handleDeviceInfo = useCallback((info: DeviceInfo) => {
    setDeviceInfo(info);
  }, []);

  const getMaxPPValue = () => {
    if (!modelStore.activeContextSettings) {
      return BENCHMARK_PARAMS_METADATA.pp.validation.max;
    }
    return Math.min(
      modelStore.activeContextSettings.n_ubatch,
      BENCHMARK_PARAMS_METADATA.pp.validation.max,
    );
  };

  const renderModelSelector = () => (
    <Menu
      visible={showModelMenu}
      onDismiss={() => setShowModelMenu(false)}
      anchorPosition="bottom"
      selectable
      anchor={
        <Button
          mode="outlined"
          onPress={() => setShowModelMenu(true)}
          contentStyle={styles.modelSelectorContent}
          icon={({color}) => (
            <Icon source="chevron-down" size={24} color={color} />
          )}>
          {selectedModel?.name ||
            modelStore.activeModel?.name ||
            'Select Model'}
        </Button>
      }>
      {modelStore.availableModels.map(model => (
        <Menu.Item
          key={model.id}
          onPress={() => handleModelSelect(model)}
          label={model.name}
          leadingIcon={
            model.id === modelStore.activeModelId ? 'check' : undefined
          }
        />
      ))}
    </Menu>
  );

  const renderSlider = ({
    name,
    testId,
  }: {
    name: keyof typeof BENCHMARK_PARAMS_METADATA;
    testId?: string;
  }) => {
    const metadata = BENCHMARK_PARAMS_METADATA[name];
    let steps = metadata.steps;

    if (name === 'pp') {
      const maxValue = getMaxPPValue();
      steps = steps.filter(step => step <= maxValue);
    }

    const stepIndex = steps.indexOf(selectedConfig[name]);

    return (
      <View style={styles.settingItem}>
        <Text variant="labelSmall" style={styles.settingLabel}>
          {name.toUpperCase()}
        </Text>
        <Slider
          testID={testId ?? `${name}-slider`}
          style={styles.slider}
          minimumValue={0}
          maximumValue={steps.length - 1}
          step={1}
          value={stepIndex}
          onValueChange={index => {
            const value = steps[Math.round(index)];
            handleSliderChange(name, value);
          }}
          thumbTintColor={theme.colors.primary}
          minimumTrackTintColor={theme.colors.primary}
        />
        <View style={styles.sliderDescriptionContainer}>
          <Text style={styles.description}>
            {metadata.descriptionKey}
            {name === 'pp' && modelStore.activeContextSettings && (
              <Text style={styles.maxValueHint}>
                {` (max: ${getMaxPPValue()})`}
              </Text>
            )}
          </Text>
          <Text style={styles.settingValue}>{selectedConfig[name]}</Text>
        </View>
      </View>
    );
  };

  const renderAdvancedSettings = () => (
    <Dialog
      testID="advanced-settings-dialog"
      visible={showAdvancedDialog}
      onDismiss={() => setShowAdvancedDialog(false)}
      title="Advanced Settings"
      scrollable
      actions={[
        {
          label: 'Done',
          onPress: () => setShowAdvancedDialog(false),
        },
      ]}>
      <View>
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Test Profile
        </Text>
        <View style={styles.presetContainer}>
          {DEFAULT_CONFIGS.map((config, index) => (
            <Button
              key={index}
              mode={selectedConfig === config ? 'contained' : 'outlined'}
              onPress={() => handlePresetSelect(config)}
              style={styles.presetButton}>
              {config.label}
            </Button>
          ))}
        </View>

        <Text variant="titleMedium" style={styles.sectionTitle}>
          Custom Parameters
        </Text>
        <Text variant="bodySmall" style={styles.advancedDescription}>
          Fine-tune the benchmark parameters for specific testing scenarios.
        </Text>
        <View style={styles.slidersContainer}>
          {renderSlider({name: 'pp'})}
          {renderSlider({name: 'tg'})}
          {renderSlider({name: 'nr'})}
        </View>
      </View>
    </Dialog>
  );

  const renderWarningMessage = () => (
    <View style={styles.warningContainer}>
      <Text variant="bodySmall" style={styles.warningText}>
        Note: Test could run for up to 2-5 minutes for larger models and cannot
        be interrupted once started.
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView style={styles.scrollView}>
        <Card elevation={0} style={styles.card}>
          <Card.Content>
            <DeviceInfoCard onDeviceInfo={handleDeviceInfo} />
            {renderModelSelector()}

            {modelStore.loadingModel ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator
                  testID="loading-indicator-model-init"
                  size="large"
                />
                <Text style={styles.loadingText}>Initializing model...</Text>
              </View>
            ) : (
              <>
                {!modelStore.context ? (
                  <Text style={styles.warning}>
                    Please select and initialize a model first
                  </Text>
                ) : (
                  <>
                    <Button
                      testID="advanced-settings-button"
                      mode="text"
                      onPress={() => setShowAdvancedDialog(true)}
                      icon="tune"
                      style={styles.advancedButton}>
                      Advanced Settings
                    </Button>

                    {!isRunning && renderWarningMessage()}

                    <Button
                      testID="start-test-button"
                      mode="contained"
                      onPress={runBenchmark}
                      disabled={isRunning}
                      style={styles.button}>
                      {isRunning ? 'Running Test...' : 'Start Test'}
                    </Button>

                    {isRunning && (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator
                          testID="loading-indicator-benchmark"
                          size="large"
                        />
                        <Text style={styles.warningText}>
                          Please keep this screen open.
                        </Text>
                      </View>
                    )}

                    {renderAdvancedSettings()}
                  </>
                )}
              </>
            )}

            {benchmarkStore.results.length > 0 && (
              <View style={styles.resultsCard}>
                <View style={styles.resultsHeader}>
                  <Text variant="titleSmall">Test Results</Text>
                  <Button
                    testID="clear-all-button"
                    mode="text"
                    onPress={handleDeleteAll}
                    icon="delete"
                    compact>
                    Clear All
                  </Button>
                </View>
                {benchmarkStore.results.map((result, index) => (
                  <View key={index} style={styles.resultItem}>
                    <BenchResultCard
                      result={result}
                      onDelete={handleDeleteResult}
                    />
                  </View>
                ))}
              </View>
            )}

            <Dialog
              visible={deleteConfirmVisible}
              onDismiss={() => setDeleteConfirmVisible(false)}
              title="Delete Result"
              actions={[
                {
                  label: 'Cancel',
                  onPress: () => setDeleteConfirmVisible(false),
                },
                {
                  label: 'Delete',
                  onPress: handleConfirmDelete,
                },
              ]}>
              <Text>
                Are you sure you want to delete this benchmark result?
              </Text>
            </Dialog>

            <Dialog
              testID="clear-all-dialog"
              visible={deleteAllConfirmVisible}
              onDismiss={() => setDeleteAllConfirmVisible(false)}
              title="Clear All Results"
              actions={[
                {
                  testID: 'clear-all-dialog-cancel-button',
                  label: 'Cancel',
                  onPress: () => setDeleteAllConfirmVisible(false),
                },
                {
                  testID: 'clear-all-dialog-confirm-button',
                  label: 'Clear All',
                  onPress: handleConfirmDeleteAll,
                },
              ]}>
              <Text>
                Are you sure you want to delete all benchmark results?
              </Text>
            </Dialog>
          </Card.Content>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
});
