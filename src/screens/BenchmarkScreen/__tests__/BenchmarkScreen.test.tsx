import React from 'react';
import {NativeModules} from 'react-native';

import {cloneDeep} from 'lodash';
import {LlamaContext} from '@pocketpalai/llama.rn';

import {fireEvent, render, waitFor} from '../../../../jest/test-utils';
import {mockResult} from '../../../../jest/fixtures/benchmark';

import {BenchmarkScreen} from '../BenchmarkScreen';

import {benchmarkStore, modelStore} from '../../../store';
import {mockContextModel} from '../../../../jest/fixtures/models';

describe('BenchmarkScreen', () => {
  beforeEach(() => {
    benchmarkStore.results = [cloneDeep(mockResult)];
    jest.clearAllMocks();
  });

  describe('Model Initialization', () => {
    it('should show loading indicator during model initialization', async () => {
      const initPromise = new Promise(resolve => setTimeout(resolve, 100));
      (modelStore.initContext as jest.Mock).mockReturnValue(initPromise);
      modelStore.isContextLoading = true;
      modelStore.loadingModel = modelStore.models[0];

      const {getByTestId} = render(<BenchmarkScreen />);

      // Verify loading indicator is shown
      expect(getByTestId('loading-indicator-model-init')).toBeDefined();

      // Wait for initialization to complete
      await initPromise;
    });

    it('should hide loading indicator after model initialization completes', async () => {
      // Loading context
      modelStore.isContextLoading = true;
      modelStore.loadingModel = modelStore.models[0];

      const {getByTestId, queryByTestId} = render(<BenchmarkScreen />);
      expect(getByTestId('loading-indicator-model-init')).toBeDefined();

      // Complete loading
      modelStore.isContextLoading = false;
      modelStore.loadingModel = undefined;

      // Verify loading indicator is removed
      await waitFor(() => {
        expect(queryByTestId('loading-indicator-model-init')).toBeNull();
      });
    });

    it('should show model selector with available models', () => {
      const {getByText} = render(<BenchmarkScreen />);

      // Open model selector
      fireEvent.press(getByText('Select Model'));

      // Verify available models are shown
      modelStore.availableModels.forEach(model => {
        expect(getByText(model.name)).toBeDefined();
      });
    });

    it('should initialize model when selected', async () => {
      const {getByText} = render(<BenchmarkScreen />);
      const modelToSelect = modelStore.availableModels[0];

      // Open model selector and select a model
      fireEvent.press(getByText('Select Model'));
      fireEvent.press(getByText(modelToSelect.name));

      // Verify initContext was called
      expect(modelStore.initContext).toHaveBeenCalledWith(modelToSelect);
    });
  });

  describe('Benchmark Execution', () => {
    it('should show benchmark loading indicator during execution', async () => {
      modelStore.activeModelId = modelStore.models[0].id;
      modelStore.context = new LlamaContext({
        contextId: 1,
        gpu: false,
        reasonNoGPU: '',
        model: mockContextModel,
      });

      const {getByText, getByTestId} = render(<BenchmarkScreen />);

      // Start benchmark
      fireEvent.press(getByTestId('start-test-button'));

      expect(getByTestId('loading-indicator-benchmark')).toBeDefined();
      expect(getByText('Please keep this screen open.')).toBeDefined();
    });

    it('should disable start button during benchmark execution', async () => {
      modelStore.activeModelId = modelStore.models[0].id;
      modelStore.context = new LlamaContext({
        contextId: 1,
        gpu: false,
        reasonNoGPU: '',
        model: mockContextModel,
      });
      const {getByTestId} = render(<BenchmarkScreen />);
      const startButton = getByTestId('start-test-button');

      // Start benchmark
      fireEvent.press(startButton);

      console.log(startButton.props.accessibilityState.disabled);
      await waitFor(() => {
        expect(startButton.props.accessibilityState.disabled).toBe(true);
      });
    });
  });

  describe('Memory Usage Tracking', () => {
    beforeAll(() => {
      // Mock DeviceInfoModule
      NativeModules.DeviceInfoModule = {
        getCPUInfo: jest.fn().mockResolvedValue({
          cores: 8,
          processors: ['CPU1', 'CPU2', 'CPU3', 'CPU4'],
        }),
      };
    });

    it('should display memory usage in results', async () => {
      const result = {
        ...mockResult,
        peakMemoryUsage: {
          total: 8 * 1000 * 1000 * 1000,
          used: 4 * 1000 * 1000 * 1000,
          percentage: 50,
        },
      };
      benchmarkStore.results = [result];

      const {getByText} = render(<BenchmarkScreen />);

      // Verify memory usage display
      expect(getByText('Peak Memory')).toBeDefined();
      expect(getByText('50.0%')).toBeDefined();
      expect(getByText('4 GB / 8 GB')).toBeDefined();
    });
  });

  describe('Advanced Settings', () => {
    it('should apply preset configurations correctly', async () => {
      modelStore.activeModelId = modelStore.models[0].id;
      modelStore.context = new LlamaContext({
        contextId: 1,
        gpu: false,
        reasonNoGPU: '',
        model: mockContextModel,
      });

      const {getByText, getByTestId} = render(<BenchmarkScreen />);

      // Open advanced settings
      fireEvent.press(getByTestId('advanced-settings-button'));
      await waitFor(() =>
        expect(getByTestId('advanced-settings-dialog')).toBeDefined(),
      );

      // Select Fast preset
      fireEvent.press(getByText('Fast'));

      // Verify preset values
      await waitFor(() => {
        const ppSlider = getByTestId('pp-slider');
        const tgSlider = getByTestId('tg-slider');
        expect(ppSlider.props.value).toBe(1);
        expect([0, undefined]).toContain(tgSlider.props.value); // slider could be undefined if it is zero or minimum value?
      });
    });
  });

  describe('Device Info Integration', () => {
    it('renders device info card', () => {
      const {getByText} = render(<BenchmarkScreen />);
      expect(getByText('Device Information')).toBeDefined();
    });
  });

  describe('Result Management', () => {
    it('renders benchmark results when available', async () => {
      benchmarkStore.results = [mockResult];
      const {getByText} = render(<BenchmarkScreen />);

      await waitFor(() => {
        expect(getByText('Test Results')).toBeDefined();
        expect(getByText(mockResult.modelName)).toBeDefined();
      });
    });

    it('should delete individual result', async () => {
      // Add results to store
      benchmarkStore.results = [mockResult];

      const {getAllByTestId, getByText} = render(<BenchmarkScreen />);

      // Delete first result
      const deleteButtons = getAllByTestId('delete-result-button');
      fireEvent.press(deleteButtons[0]);

      // Confirm deletion
      fireEvent.press(getByText('Delete'));

      // Verify deletion
      expect(benchmarkStore.removeResult).toHaveBeenCalledWith(
        mockResult.timestamp,
      );
    });

    it('should cancel result deletion', async () => {
      // Add results to store
      benchmarkStore.results = [mockResult];

      const {getAllByTestId, getByText} = render(<BenchmarkScreen />);

      // Attempt to delete result
      const deleteButtons = getAllByTestId('delete-result-button');
      fireEvent.press(deleteButtons[0]);

      // Cancel deletion
      fireEvent.press(getByText('Cancel'));

      // Verify result was not deleted
      expect(benchmarkStore.removeResult).not.toHaveBeenCalled();
    });

    it('allows clearing all results after confirmation', async () => {
      benchmarkStore.results = [mockResult];
      const {getByTestId} = render(<BenchmarkScreen />);

      // Click clear all button
      const clearButton = getByTestId('clear-all-button');
      fireEvent.press(clearButton);

      // Confirm in the dialog
      const confirmButton = getByTestId('clear-all-dialog-confirm-button');
      fireEvent.press(confirmButton);

      expect(benchmarkStore.results.length).toBe(0);
    });

    it('should clear all results', async () => {
      // Add results to store
      benchmarkStore.results = [mockResult];

      const {getByTestId} = render(<BenchmarkScreen />);

      // Clear all results
      const clearAllButton = getByTestId('clear-all-button');
      fireEvent.press(clearAllButton);

      // Confirm clear all
      const confirmButton = getByTestId('clear-all-dialog-confirm-button');
      fireEvent.press(confirmButton);

      // Verify all results were cleared
      expect(benchmarkStore.clearResults).toHaveBeenCalled();
    });

    it('keeps results if clear all is cancelled', async () => {
      benchmarkStore.results = [mockResult];
      const {getByTestId} = render(<BenchmarkScreen />);

      // Click clear all button
      const clearButton = getByTestId('clear-all-button');
      fireEvent.press(clearButton);

      // Cancel in the dialog
      const cancelButton = getByTestId('clear-all-dialog-cancel-button');
      fireEvent.press(cancelButton);

      expect(benchmarkStore.results.length).toBe(1);
    });
  });
});
