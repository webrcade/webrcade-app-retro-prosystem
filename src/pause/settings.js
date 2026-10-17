import React from 'react';
import { Component } from 'react';

import {
  AppDisplaySettingsTab,
  EditorScreen,
  FieldsTab,
  FieldRow,
  FieldLabel,
  FieldControl,
  GamepadWhiteImage,
  TelevisionWhiteImage,
  BlurImage,
  Select,
  Switch,
  ShaderSettingsTab,
  WebrcadeContext,
} from '@webrcade/app-common';

export class AtariSettingsEditor extends Component {
  constructor() {
    super();
    this.state = {
      tabIndex: null,
      focusGridComps: null,
      values: {},
    };

    this.busy = false;
  }

  componentDidMount() {
    const { emulator } = this.props;

    const values = {
      leftDiffSwitch: emulator.getLeftDifficulty(),
      rightDiffSwitch: emulator.getRightDifficulty(),
      dualAnalog: emulator.isDualAnalog(),
      origBilinearMode: emulator.getPrefs().getBilinearMode(),
      bilinearMode: emulator.getPrefs().getBilinearMode(),
      origScreenSize: emulator.getPrefs().getScreenSize(),
      screenSize: emulator.getPrefs().getScreenSize(),
      origScreenControls: emulator.getPrefs().getScreenControls(),
      screenControls: emulator.getPrefs().getScreenControls(),
    }

    this.shaderService = this.props.emulator.getShadersService();
    this.shaderService.addEditorValues(values);

    this.setState({
      values: values
    });
  }

  render() {
    const { emulator, onClose, showOnScreenControls } = this.props;
    const { tabIndex, values, focusGridComps } = this.state;

    const setFocusGridComps = (comps) => {
      this.setState({ focusGridComps: comps });
    };

    const setValues = (values) => {
      this.setState({ values: values });
    };

    const tabs = [];

    let tab = 0;

    tabs.push({
      image: GamepadWhiteImage,
      label: 'Atari 7800 Settings (Session only)',
      content: (
        <AtariSettingsTab
          emulator={emulator}
          isActive={tabIndex === tab}
          setFocusGridComps={setFocusGridComps}
          values={values}
          setValues={setValues}
        />
      ),
    });
    tab++;

    tabs.push({
        image: TelevisionWhiteImage,
        label: 'Display Settings',
        content: (
          <AppDisplaySettingsTab
            emulator={emulator}
            isBilinearMode={true}
            isActive={tabIndex === tab}
            showOnScreenControls={showOnScreenControls}
            setFocusGridComps={setFocusGridComps}
            values={values}
            setValues={setValues}
          />
        )
    });
    tab++;

    tabs.push({
      image: BlurImage,
      label: 'Shader Settings',
      content: (
        <ShaderSettingsTab
          shaderService={this.shaderService}
          emulator={emulator}
          isActive={tabIndex === tab}
          setFocusGridComps={setFocusGridComps}
          values={values}
          setValues={setValues}
        />
      )
    });

    return (
      <EditorScreen
        showCancel={true}
        onOk={async () => {
          if (this.busy) return;
          this.busy = true;

          emulator.setLeftDifficulty(values.leftDiffSwitch);
          emulator.setRightDifficulty(values.rightDiffSwitch);
          emulator.setDualAnalog(values.dualAnalog);

          let change = false;
          if (values.origBilinearMode !== values.bilinearMode) {
            emulator.getPrefs().setBilinearMode(values.bilinearMode);
            change = true;
          }
          if (values.origScreenSize !== values.screenSize) {
            emulator.getPrefs().setScreenSize(values.screenSize);
            emulator.updateScreenSize();
            change = true;
          }
          if (values.origScreenControls !== values.screenControls) {
            emulator.getPrefs().setScreenControls(values.screenControls);
            emulator.updateOnScreenControls();
            change = true;
          }
          if (change) {
            emulator.getPrefs().save();
          }

          // Set the shader
          await this.shaderService.setShader(values.shaderId);
          emulator.updateBilinearFilter();

          onClose();
        }}
        onClose={onClose}
        focusGridComps={focusGridComps}
        onTabChange={(oldTab, newTab) => this.setState({ tabIndex: newTab })}
        tabs={tabs}
      />
    );
  }
}

class AtariSettingsTab extends FieldsTab {
  constructor() {
    super();
    this.leftDiffSwitchRef = React.createRef();
    this.rightDiffSwitchRef = React.createRef();
    this.dualAnalogRef = React.createRef();
    this.gridComps = [
        [this.leftDiffSwitchRef],
        [this.rightDiffSwitchRef],
        [this.dualAnalogRef]
    ];
  }

  componentDidUpdate(prevProps, prevState) {
    const { gridComps } = this;
    const { setFocusGridComps } = this.props;
    const { isActive } = this.props;

    if (isActive && isActive !== prevProps.isActive) {
      setFocusGridComps(gridComps);
    }
  }

  render() {
    const { leftDiffSwitchRef, rightDiffSwitchRef, dualAnalogRef } = this;
    const { focusGrid } = this.context;
    const { setValues, values } = this.props;

    return (
      <>
        <FieldRow>
          <FieldLabel>Left Diff. Switch</FieldLabel>
          <FieldControl>
          <Select
              ref={leftDiffSwitchRef}
              options={[
                { value: "a", label: "A"},
                { value: "b", label: "B"}
              ]}
              onChange={(value) => {
                setValues({
                  ...values,
                  ...{ leftDiffSwitch: value},
                });
              }}
              value={values.leftDiffSwitch}
              onPad={(e) => focusGrid.moveFocus(e.type, leftDiffSwitchRef)}
            />
          </FieldControl>
        </FieldRow>
        <FieldRow>
          <FieldLabel>Right Diff. Switch</FieldLabel>
          <FieldControl>
          <Select
              ref={rightDiffSwitchRef}
              options={[
                { value: "a", label: "A"},
                { value: "b", label: "B"}
              ]}
              onChange={(value) => {
                setValues({
                  ...values,
                  ...{ rightDiffSwitch: value},
                });
              }}
              value={values.rightDiffSwitch}
              onPad={(e) => focusGrid.moveFocus(e.type, rightDiffSwitchRef)}
            />
          </FieldControl>
        </FieldRow>
        <FieldRow>
          <FieldLabel>Dual Analog</FieldLabel>
          <FieldControl>
          <Switch
              ref={dualAnalogRef}
              onChange={(e) => {
                setValues({
                  ...values,
                  ...{ dualAnalog: e.target.checked},
                })
              }}
              checked={values.dualAnalog}
              onPad={(e) => focusGrid.moveFocus(e.type, dualAnalogRef)}
            />
          </FieldControl>
        </FieldRow>
      </>
    );
  }
}
AtariSettingsTab.contextType = WebrcadeContext;
