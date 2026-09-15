import assert from "node:assert/strict";
import test from "node:test";
import { Avatar } from "@douban-bridge/ui/components/avatar";
import { Badge } from "@douban-bridge/ui/components/badge";
import { Button } from "@douban-bridge/ui/components/button";
import { ButtonGroup } from "@douban-bridge/ui/components/button-group";
import { Card } from "@douban-bridge/ui/components/card";
import { Drawer } from "@douban-bridge/ui/components/drawer";
import { DropdownMenu } from "@douban-bridge/ui/components/dropdown-menu";
import { Input } from "@douban-bridge/ui/components/input";
import { InputGroup } from "@douban-bridge/ui/components/input-group";
import { Item } from "@douban-bridge/ui/components/item";
import { NativeSelect } from "@douban-bridge/ui/components/native-select";
import { Separator } from "@douban-bridge/ui/components/separator";
import { Spinner } from "@douban-bridge/ui/components/spinner";
import { Switch } from "@douban-bridge/ui/components/switch";
import { Table } from "@douban-bridge/ui/components/table";
import { Textarea } from "@douban-bridge/ui/components/textarea";
import { Toaster } from "@douban-bridge/ui/components/toast";

test("exports every shared primitive family", () => {
  for (const component of [
    Avatar,
    Badge,
    ButtonGroup,
    Button,
    Card,
    Drawer,
    DropdownMenu,
    InputGroup,
    Input,
    Item,
    NativeSelect,
    Separator,
    Toaster,
    Spinner,
    Switch,
    Table,
    Textarea,
  ]) {
    assert.equal(typeof component, "function");
  }
});
