from typing import Any


def test_saveParam_add_and_update_existing_param(droneStatus) -> None:
    controller = droneStatus.drone.paramsController
    old_params = controller.params.copy()

    try:
        controller.params = []

        controller.saveParam("TEST_PARAM", 1.0, 9)
        assert len(controller.params) == 1
        assert controller.params[0]["param_value"] == 1.0

        controller.saveParam("TEST_PARAM", 2.5, 9)
        assert len(controller.params) == 1
        assert controller.params[0]["param_value"] == 2.5
    finally:
        controller.params = old_params


def test_getSingleParam_returns_cached_param(droneStatus) -> None:
    controller = droneStatus.drone.paramsController
    old_params = controller.params.copy()

    try:
        controller.params = [
            {"param_id": "FOO", "param_value": 123.0, "param_type": 9},
        ]

        result = controller.getSingleParam("FOO")
        assert result == {"param_id": "FOO", "param_value": 123.0, "param_type": 9}
    finally:
        controller.params = old_params


def test_getSingleParam_missing_returns_empty_dict(droneStatus) -> None:
    controller = droneStatus.drone.paramsController
    old_params = controller.params.copy()

    try:
        controller.params = []
        result = controller.getSingleParam("DOES_NOT_EXIST")
        assert result == {}
    finally:
        controller.params = old_params


def test_fetchAllParamsBlocking_returns_error_when_param_value_reserved(
    droneStatus,
) -> None:
    controller = droneStatus.drone.paramsController
    lock_owner = "test_params_controller_lock"

    reserved = droneStatus.drone.reserve_message_type("PARAM_VALUE", lock_owner)
    assert reserved is True

    try:
        result = controller.fetchAllParamsBlocking(timeout_secs=2)
        assert result["success"] is False
        assert result["message"] == "Could not reserve PARAM_VALUE messages"
    finally:
        droneStatus.drone.release_message_type("PARAM_VALUE", lock_owner)


def test_fetchAllParamsBlocking_success_sorts_and_updates_progress(droneStatus) -> None:
    controller = droneStatus.drone.paramsController
    old_params = controller.params.copy()
    progress_updates: list[dict[str, Any]] = []

    result = controller.fetchAllParamsBlocking(
        timeout_secs=120,
        progress_update_callback=lambda data: progress_updates.append(data),
    )

    try:
        assert result["success"] is True
        assert len(controller.params) > 0

        param_ids = [item["param_id"] for item in controller.params]
        assert param_ids == sorted(param_ids)

        assert len(progress_updates) > 0
        assert (
            progress_updates[-1]["current_param_index"] + 1
            == progress_updates[-1]["total_number_of_params"]
        )

        assert controller.is_requesting_params is False
        assert controller.current_param_index == 0
        assert controller.current_param_id == ""
        assert controller.total_number_of_params == 0
    finally:
        controller.params = old_params


def test_fetchAllParamsBlocking_cancelled_before_start(droneStatus) -> None:
    controller = droneStatus.drone.paramsController

    result = controller.fetchAllParamsBlocking(
        timeout_secs=120,
        should_cancel_callback=lambda: True,
    )

    assert result["success"] is False
    assert result["message"] == "Connection cancelled by user."
