/** 1차원 칼만 필터. GPS 위도/경도처럼 흔들리는 숫자를 부드럽게 만듭니다. */
export class KalmanFilter1D {
  private estimate: number | null = null;
  private errorCovariance = 1;

  constructor(
    private readonly processNoise: number,
    private readonly measurementNoise: number
  ) {}

  update(measurement: number, measurementNoise?: number): number {
    const r = measurementNoise ?? this.measurementNoise;
    if (this.estimate == null) {
      this.estimate = measurement;
      this.errorCovariance = r;
      return this.estimate;
    }

    const predictedError = this.errorCovariance + this.processNoise;
    const gain = predictedError / (predictedError + r);
    this.estimate += gain * (measurement - this.estimate);
    this.errorCovariance = (1 - gain) * predictedError;
    return this.estimate;
  }

  reset(): void {
    this.estimate = null;
    this.errorCovariance = 1;
  }
}

/** 위도·경도를 각각 칼만 필터로 다듬습니다. 정확도가 나쁠수록 새 점을 덜 믿습니다. */
export class GpsKalmanFilter {
  private readonly latFilter = new KalmanFilter1D(8e-10, 4e-9);
  private readonly lngFilter = new KalmanFilter1D(8e-10, 4e-9);

  update(lat: number, lng: number, accuracyM: number): { lat: number; lng: number } {
    const r = Math.max(1, accuracyM / 8) ** 2 * 4e-9;
    return {
      lat: this.latFilter.update(lat, r),
      lng: this.lngFilter.update(lng, r),
    };
  }

  reset(): void {
    this.latFilter.reset();
    this.lngFilter.reset();
  }
}
