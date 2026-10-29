"use client";

import { useActionState } from "react";
import { Alert, Button, Card } from "@/components/ui";
import { SETTINGS, SETTING_KEYS, type SettingsMap } from "@/lib/settings-definitions";
import { saveSettings } from "./actions";

export function SettingsForm({ values }: { values: SettingsMap }) {
  const [state, action, pending] = useActionState(saveSettings, {});
  return (
    <form action={action} className="space-y-4">
      {state.message && <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>}
      {SETTING_KEYS.map((key) => {
        const def = SETTINGS[key];
        return (
          <Card key={key}>
            <fieldset>
              <legend className="mb-3 font-semibold">{def.label}</legend>
              <div className="space-y-2">
                {Object.entries(def.options).map(([value, label]) => (
                  <label key={value} className="flex cursor-pointer items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name={key}
                      value={value}
                      defaultChecked={values[key] === value}
                      className="mt-1 accent-primary"
                    />
                    <span>
                      {label}
                      {def.default === value && <span className="ms-2 text-xs text-muted">(الافتراضي)</span>}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          </Card>
        );
      })}
      <Button type="submit" disabled={pending}>
        حفظ الإعدادات
      </Button>
    </form>
  );
}
